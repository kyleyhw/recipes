/**
 * Model prices, and the cost of a single call.
 *
 * Deliberately free of `server-only` and of any database or network access, so
 * the arithmetic that the spend ceiling depends on is a pure function that can
 * be tested directly. A ceiling enforced by untested arithmetic is not a
 * ceiling.
 *
 * Prices are per million tokens, in USD, as published for the first-party
 * Anthropic API on 2026-08-10. They are recorded here rather than fetched
 * because a price that changes underneath a running deployment must not
 * silently rewrite what past calls are believed to have cost: `AiInteraction`
 * stores the cost computed at call time, and this table is only ever used to
 * price *new* calls.
 */

/**
 * The two models this application uses.
 *
 * `reasoning` handles the tasks where the output is prose a person will cook
 * from — generation, substitution, extraction — and where a worse model
 * produces a worse dinner. `cheap` handles mechanical selection among
 * candidates that have already been narrowed by a deterministic search, where
 * the model is choosing between given options rather than composing anything.
 */
export const MODELS = {
  reasoning: "claude-opus-5",
  cheap: "claude-haiku-4-5",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const MODEL_PRICING: Record<ModelId, ModelPrice> = {
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};

/**
 * Prompt-cache multipliers against the base input price. Writing to the cache
 * costs more than an ordinary input token, reading from it costs far less.
 *
 * This application does not currently enable prompt caching — its prompts are
 * short and its calls infrequent, so there is nothing to amortise — but the
 * usage object reports these counters unconditionally, and pricing them at zero
 * would understate the bill the moment caching is switched on.
 */
export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

/**
 * Server-side web search is billed per search, not per token: $10 per 1,000
 * searches. At one or two searches per photo this dominates the token cost of
 * the photo-sourcing call, which is why the search budget per call is capped.
 */
export const WEB_SEARCH_USD_PER_REQUEST = 10 / 1000;

/** One million — the denominator of every published price. */
const TOKENS_PER_MTOK = 1_000_000;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  webSearchRequests?: number;
}

/**
 * Cost of one call, in USD.
 *
 * The sum is exact rather than rounded: a call costing $0.0003 rounds to zero
 * at any sensible display precision, and rounding *before* accumulation would
 * make a thousand such calls appear free.
 */
export function costUsd(model: ModelId, usage: TokenUsage): number {
  const price = MODEL_PRICING[model];
  const input = usage.inputTokens * price.inputPerMTok;
  const output = usage.outputTokens * price.outputPerMTok;
  const cacheWrite =
    (usage.cacheCreationTokens ?? 0) * price.inputPerMTok * CACHE_WRITE_MULTIPLIER;
  const cacheRead =
    (usage.cacheReadTokens ?? 0) * price.inputPerMTok * CACHE_READ_MULTIPLIER;

  return (
    (input + output + cacheWrite + cacheRead) / TOKENS_PER_MTOK +
    (usage.webSearchRequests ?? 0) * WEB_SEARCH_USD_PER_REQUEST
  );
}

/**
 * Formats a cost for display.
 *
 * Two decimal places hide everything this application actually spends, so small
 * figures get four. The point of showing the number at all is to make the cost
 * of a feature legible before it accumulates into something noticeable.
 */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
