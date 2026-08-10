import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { AiKind } from "@/generated/prisma";
import { db } from "@/lib/db";
import { env, features } from "@/lib/env";
import { costUsd, formatUsd, MODELS, type ModelId } from "@/lib/ai/pricing";
import { toolInputSchema } from "@/lib/ai/schemas";

/**
 * The single path from this application to Claude.
 *
 * Every model call in the application goes through `callWithTool`, which owns
 * the four things that must not be re-decided per feature:
 *
 *   1. **The spend ceiling.** Checked before the call, from recorded usage.
 *   2. **Usage recording.** Every response is logged with its cost, including
 *      responses that turn out to be unusable — an invalid answer is billed
 *      exactly like a valid one, and a ceiling computed only from successes
 *      would drift below the real bill.
 *   3. **Schema validation with one retry.** The answer is a tool call
 *      validated against a zod schema; a malformed one is sent back with its
 *      validation errors and one further attempt is made.
 *   4. **Failure as data.** Nothing here throws. Every failure — no key, over
 *      budget, rate limited, unreachable, refused, malformed — is a tagged
 *      result the caller renders as a message, because an AI feature failing
 *      must never take a page down with it.
 *
 * ## Why tool use rather than a text answer
 *
 * The model's answer is always a call to a tool whose input schema is derived
 * from a zod schema (`lib/ai/schemas.ts`). The application therefore acts on
 * typed data it has validated, not on prose it has re-parsed. The alternative —
 * asking for JSON in the reply — differs precisely in that the parsing failure
 * mode is silent and format drift is invisible until something downstream
 * behaves oddly.
 *
 * ## Why `tool_choice` is not forced
 *
 * It would be natural to force the tool with `tool_choice: {type: "tool"}`.
 * That is left on `auto`, and the loop below treats "replied with text instead
 * of calling the tool" as a correctable failure, so that the request stays
 * valid alongside adaptive thinking and alongside the server-side web search
 * tool — both of which need the model free to decide what to do next. The
 * correction turn costs one round trip in a case that is rare; a rejected
 * request would cost the feature.
 */

/**
 * Maximum assistant turns in one call.
 *
 * Reached only by the photo path, where the model searches (possibly across a
 * `pause_turn` boundary) before answering. A bound is required because every
 * turn is billable and a loop with no bound is a way to spend the entire
 * monthly ceiling on one request.
 */
const MAX_TURNS = 6;

/** Attempts to correct a malformed or missing answer. The plan specifies one. */
const MAX_CORRECTIONS = 1;

/** Default output cap. Generous for a recipe; far below the streaming limit. */
const DEFAULT_MAX_TOKENS = 8_000;

const client = features.ai
  ? new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      // Transport-level retries for 429s and 5xxs. Distinct from the schema
      // correction above, which is a retry of the *answer*, not of the request.
      maxRetries: 2,
    })
  : null;

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type AiFailureReason =
  /** No API key configured. Every AI feature hides itself in this state. */
  | "disabled"
  | "budget-exceeded"
  | "rate-limited"
  | "unreachable"
  | "api-error"
  /** The model declined to answer. */
  | "refused"
  /** The model answered, but not in a shape the application can act on. */
  | "invalid-response";

export interface AiFailure {
  ok: false;
  reason: AiFailureReason;
  /** Renderable as-is. Says what happened and what the owner can do about it. */
  message: string;
}

export interface AiSuccess<T> {
  ok: true;
  data: T;
  costUsd: number;
}

export type AiResult<T> = AiSuccess<T> | AiFailure;

function fail(reason: AiFailureReason, message: string): AiFailure {
  return { ok: false, reason, message };
}

// ---------------------------------------------------------------------------
// The spend ceiling
// ---------------------------------------------------------------------------

export interface BudgetStatus {
  spentUsd: number;
  ceilingUsd: number;
  remainingUsd: number;
  exceeded: boolean;
  /** Start of the accounting window. */
  since: Date;
  /** Calls made in the window, for context on the figure. */
  calls: number;
}

/**
 * First instant of the current UTC month.
 *
 * UTC rather than local time so that the window does not shift when a
 * deployment moves region, which would make the ceiling briefly double-count or
 * skip a day of spending.
 */
function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Spend so far this month, against the configured ceiling.
 *
 * Computed from `AiInteraction`, which stores the cost priced at call time.
 * This deliberately does not consult Anthropic's billing: the ceiling is a
 * guard on *this deployment's* behaviour, it must work with no extra
 * credentials, and it must be checkable before every call without a network
 * round trip.
 */
export async function budgetStatus(): Promise<BudgetStatus> {
  const since = startOfMonthUtc(new Date());
  const summary = await db.aiInteraction.aggregate({
    where: { createdAt: { gte: since } },
    _sum: { costUsd: true },
    _count: true,
  });

  const spentUsd = summary._sum.costUsd ?? 0;
  const ceilingUsd = env.AI_MONTHLY_BUDGET_USD;
  return {
    spentUsd,
    ceilingUsd,
    remainingUsd: Math.max(0, ceilingUsd - spentUsd),
    exceeded: spentUsd >= ceilingUsd,
    since,
    calls: summary._count,
  };
}

/** Records one response. Returns its cost so the caller can accumulate. */
async function recordUsage(
  kind: AiKind,
  recipeId: string | null,
  model: ModelId,
  usage: Anthropic.Messages.Usage,
): Promise<number> {
  const webSearchRequests = usage.server_tool_use?.web_search_requests ?? 0;
  const cost = costUsd(model, {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    webSearchRequests,
  });

  await db.aiInteraction.create({
    data: {
      recipeId,
      kind,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: cost,
      webSearchRequests,
    },
  });

  return cost;
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

export interface ToolCallRequest<T> {
  kind: AiKind;
  /** Associates the interaction with a recipe in the audit log, when there is one. */
  recipeId?: string | null;
  system: string;
  prompt: string;
  tool: {
    name: string;
    description: string;
    schema: z.ZodType<T>;
  };
  /** Enables the server-side web search tool, capped at `maxUses` searches. */
  webSearch?: { maxUses: number };
  model?: ModelId;
  /** Reasoning effort. Low for mechanical choices, high for composition. */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

/**
 * Asks Claude a question whose answer is a validated call to one tool.
 *
 * Streaming is used throughout, then reduced to the final message. The
 * application has no use for partial output — it acts on the whole validated
 * answer or on none of it — but a non-streaming request with a large token
 * budget risks a request timeout, and paying for a call that then times out is
 * the worst of both outcomes.
 */
export async function callWithTool<T>(request: ToolCallRequest<T>): Promise<AiResult<T>> {
  if (!client) {
    return fail(
      "disabled",
      "Claude features are off because ANTHROPIC_API_KEY is not set. See docs/self-hosting.md.",
    );
  }

  const budget = await budgetStatus();
  if (budget.exceeded) {
    return fail(
      "budget-exceeded",
      `This month's Claude spend (${formatUsd(budget.spentUsd)}) has reached the ceiling of ` +
        `${formatUsd(budget.ceilingUsd)}. Raise AI_MONTHLY_BUDGET_USD to continue. ` +
        `Everything except the Claude features works normally.`,
    );
  }

  const model = request.model ?? MODELS.reasoning;
  const recipeId = request.recipeId ?? null;

  const tools: Anthropic.Messages.ToolUnion[] = [
    {
      name: request.tool.name,
      description: request.tool.description,
      // Validated server-side against the schema as well as here, so a
      // malformed call is caught before it is ever billed as output.
      strict: true,
      input_schema: toolInputSchema(
        request.tool.schema,
      ) as Anthropic.Messages.Tool.InputSchema,
    },
  ];
  if (request.webSearch) {
    tools.push({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: request.webSearch.maxUses,
    });
  }

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: request.prompt },
  ];

  let spent = 0;
  let corrections = 0;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const message = await client.messages
        .stream({
          model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: request.system,
          messages,
          tools,
          // Adaptive thinking lets the model spend reasoning where the task
          // needs it. `budget_tokens` is rejected outright by this model
          // generation and must not be sent.
          thinking: { type: "adaptive" },
          output_config: { effort: request.effort ?? "medium" },
        })
        .finalMessage();

      spent += await recordUsage(request.kind, recipeId, model, message.usage);

      if (message.stop_reason === "refusal") {
        return fail(
          "refused",
          "Claude declined to answer this request. Rephrasing it usually helps.",
        );
      }

      const call = message.content.find(
        (block) => block.type === "tool_use" && block.name === request.tool.name,
      );

      if (call && call.type === "tool_use") {
        const parsed = request.tool.schema.safeParse(call.input);
        if (parsed.success) {
          return { ok: true, data: parsed.data, costUsd: spent };
        }
        if (corrections >= MAX_CORRECTIONS) {
          return fail(
            "invalid-response",
            "Claude's answer did not match the expected format, twice. Try again, or do this by hand.",
          );
        }
        corrections++;
        // The tool result carries the validation errors, so the correction is
        // specific rather than a bare "try again".
        messages.push({ role: "assistant", content: message.content });
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: call.id,
              is_error: true,
              content: `The arguments did not validate:\n${parsed.error.issues
                .slice(0, 5)
                .map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`)
                .join("\n")}\nCall ${request.tool.name} again with corrected arguments.`,
            },
          ],
        });
        continue;
      }

      // A server tool ran long enough that the turn was paused. Handing the
      // assistant's content straight back is what resumes it; dropping out here
      // would silently truncate the answer.
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }

      if (message.stop_reason === "max_tokens") {
        return fail(
          "invalid-response",
          "Claude's answer was cut off before it finished. Try a smaller request.",
        );
      }

      // Answered in prose instead of calling the tool. Correctable once.
      if (corrections >= MAX_CORRECTIONS) {
        return fail(
          "invalid-response",
          "Claude did not answer in the required form. Try again, or do this by hand.",
        );
      }
      corrections++;
      messages.push({ role: "assistant", content: message.content });
      messages.push({
        role: "user",
        content: `Answer by calling the ${request.tool.name} tool. Do not reply in prose.`,
      });
    }

    return fail(
      "invalid-response",
      "Claude did not reach an answer within the allowed number of steps.",
    );
  } catch (error) {
    return fail(...describeError(error));
  }
}

/**
 * Maps an SDK error to a reason and a message the owner can act on.
 *
 * Ordered most specific first, because the Anthropic error classes form an
 * inheritance chain and a check against the base class would swallow all of
 * them.
 */
function describeError(error: unknown): [AiFailureReason, string] {
  if (error instanceof Anthropic.AuthenticationError) {
    return ["api-error", "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."];
  }
  if (error instanceof Anthropic.RateLimitError) {
    return [
      "rate-limited",
      "Rate limited by the Anthropic API. Wait a moment and retry.",
    ];
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return [
      "unreachable",
      "Could not reach the Anthropic API. Check the network and retry.",
    ];
  }
  if (error instanceof Anthropic.APIError) {
    return ["api-error", `The Anthropic API returned an error: ${error.message}`];
  }
  return ["api-error", "An unexpected error occurred while calling Claude."];
}
