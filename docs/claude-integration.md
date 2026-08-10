# Claude integration

Five features use the model, all server-side, all through one function. This
document covers what they do, how cost is bounded, and what happens when
anything goes wrong — which is most of the interesting content, because a
feature that depends on a paid remote service fails in more ways than the rest
of the application put together.

---

## 1. The shape of every call

`lib/ai/client.ts` exposes exactly one entry point, `callWithTool`. Every
feature is a system prompt, a user prompt, and a zod schema handed to it.

```
callWithTool({ kind, system, prompt, tool: { name, description, schema }, … })
    -> { ok: true, data, costUsd } | { ok: false, reason, message }
```

Four things live in that function precisely because they must not be
re-decided per feature:

1. **The spend ceiling**, checked before the call.
2. **Usage recording**, for every response, including unusable ones.
3. **Schema validation with one correction attempt.**
4. **Failure as data.** Nothing throws.

### Tool use, not JSON in prose

The answer is always a call to a tool whose input schema is generated from a
zod schema in `lib/ai/schemas.ts`. The same schema then validates the arguments
and the TypeScript type is inferred from it, so the contract is declared once.

The alternative — asking for JSON in the reply and parsing it — differs in its
failure mode, not its happy path: format drift is silent, and a mis-parse
produces a plausible object rather than an error. Here, an answer that does not
validate is a typed failure the caller renders as a message.

`lib/ai/schemas.ts` also holds `toolInputSchema`, which post-processes zod's
JSON Schema output into the strict subset: every object closed to unknown
properties, every property required. It is applied as a transform rather than
asserted, so adding an optional field later cannot silently produce a definition
the API rejects.

### `tool_choice` is left on `auto`

Forcing the tool would be natural and is deliberately not done, so that the
request stays valid alongside adaptive thinking and alongside the server-side
web search tool — both of which need the model free to decide what to do next.
"Replied in prose instead of calling the tool" is handled as a correctable
failure, costing one round trip in a rare case rather than the feature.

### Streaming

Every call streams and is then reduced to its final message. The application has
no use for partial output — it acts on the whole validated answer or none of it
— but a non-streaming request with a large token budget risks a request timeout,
and paying for a call that then times out is the worst of both outcomes.

---

## 2. The five features

| Feature | Module | Model | Why that model |
| --- | --- | --- | --- |
| Generation | `ai/generate.ts` | Opus 5 | Composition; the quality shows up on the plate. |
| Substitution | `ai/substitute.ts` | Opus 5 | Judgement about food and about ratios. |
| Extraction | `ai/extract.ts` | Opus 5 | The answer is in the input; low effort. |
| Photo search | `ai/photo.ts` | Haiku 4.5 | Recognition, not reasoning; the search dominates the cost. |
| USDA matching | `ai/macro-match.ts` | Haiku 4.5 | Selection from a list that a search already narrowed. |

### Memories are injected into every recipe-writing prompt

`lib/ai/context.ts` composes the system prompt for generation, substitution, and
extraction from three parts: who the collection belongs to, the standing
memories from `lib/memories.ts`, and the house style for steps.

This is the wiring that makes a preference stated once — *I like strong
flavours* — apply to a recipe generated six months later. Composing it per
feature would let the three drift, and a drifted memory is worse than an absent
one: the owner would see their preference honoured in one place and ignored in
another with no way to tell why.

### Substitution returns a diff, not a rewritten recipe

The model is asked to reproduce the lines it is replacing verbatim, and
`lib/ai/diff.ts` matches those against the stored recipe. Matching is exact
first, then loosened for case, whitespace, and typographic apostrophes — the
ways a reproduced line differs from a copied one, none of which changes which
line is meant.

**An edit that matches nothing is reported, never applied.** Appending it, or
attaching it to the nearest line, would produce a recipe that looks complete and
is wrong, discovered while standing at the hob. Substring matching is not
implemented for the same reason: *butter* occurs inside *buttermilk*.

The result is rendered as a preview with editable text, so the owner accepts,
edits, or discards. Applying marks the recipe a `DRAFT`, because it has not been
cooked in that form.

### Generated and extracted recipes are always drafts

`lib/ai/drafts.ts` writes them with `status: DRAFT`, and re-parses their
ingredient lines through the same parser every hand-typed recipe uses. One
parser, one set of conventions, one nutrition pipeline calibrated against them —
a second, invisible parser inside the model's answer would surface as
unexplained macro differences between a typed recipe and a generated one.

### Photo search is the most expensive call

Server-side web search is billed per search, at \$10 per 1,000, which at one or
two searches exceeds the token cost of the call. The search budget is capped at
two: one query, and one chance to reformulate. A third would be paying to search
for a dish the web has no photograph of, which no number of queries fixes.

Several candidates are requested because every one is downloaded and validated
against the same thresholds as any other photo — reachable, decodes, at least
600 px on the short edge, plausible aspect ratio — and search results fail that
often. Unused candidates are stored on the recipe, so replacing the photo later
is free. Candidate URLs are also restricted to `http`/`https` before fetching,
so a `file:` URL cannot turn the photo fetcher into a reader of the server's own
filesystem.

---

## 3. Cost

### Pricing

`lib/ai/pricing.ts` is pure and unit-tested, because the ceiling is enforced
entirely from its arithmetic and a ceiling computed by untested code is not a
ceiling.

| | Input \$/MTok | Output \$/MTok |
| --- | --- | --- |
| `claude-opus-5` | 5 | 25 |
| `claude-haiku-4-5` | 1 | 5 |

Plus \$0.01 per web search, and the standard cache multipliers (1.25× input for
a write, 0.1× for a read) — priced even though caching is not currently enabled,
because pricing them at zero would understate the bill the moment it is.

Costs are summed exactly and never rounded before accumulation: a call costing
\$0.0003 rounds to zero at any sensible display precision, and a thousand of
them would then appear free.

### The ceiling

`AI_MONTHLY_BUDGET_USD` (default 10) is checked against the sum of `costUsd`
over `AiInteraction` rows created since the start of the current UTC month.
Exceeding it returns a `budget-exceeded` failure **before** any request is made,
with a message naming the figures.

It is computed from this deployment's own records rather than from Anthropic's
billing, so it needs no extra credentials and no network round trip, and it
works identically on a laptop and on Vercel.

Every response is recorded, including responses that fail validation. An invalid
answer is billed exactly like a valid one, and a ceiling computed only from
successes would drift below the real bill.

Spend is shown next to every button that can spend it — on the generation page,
the substitution page, and the import page — because a ceiling the owner cannot
see is one they discover by hitting it, halfway through cooking.

---

## 4. Failure

Every failure is a value, never an exception:

| `reason` | Cause | What the owner sees |
| --- | --- | --- |
| `disabled` | No `ANTHROPIC_API_KEY`. | Nothing — the features are hidden. |
| `budget-exceeded` | Ceiling reached. | Spend, ceiling, and which variable to raise. |
| `rate-limited` | 429 after SDK retries. | Wait and retry. |
| `unreachable` | Connection failure. | Check the network. |
| `api-error` | Rejected key, or anything else. | The API's own message. |
| `refused` | `stop_reason: refusal`. | Rephrase the request. |
| `invalid-response` | Two malformed answers, or a truncated one. | Try again, or do it by hand. |

The error mapping checks the SDK's error classes most-specific-first, since they
form an inheritance chain and a check against the base class would swallow all
of them.

### Degradation with no key

Every non-AI feature works with no `ANTHROPIC_API_KEY` set, and the AI features
do not appear at all rather than appearing and failing:

- The **Generate** link is absent from the header, and `/generate` redirects.
- The **Substitute** link is absent, and the substitution page redirects.
- The **Find one with Claude** photo control is absent.
- The **Read it with Claude** import button is absent.

Recipes still import from a URL (via schema.org JSON-LD), from pasted text, from
a share link, and from a file; photos still come from the source page, from an
upload, or from the deterministic placeholder; macros still resolve against the
local library and USDA.

### Escalation is manual

Claude is never an automatic fallback. When structured-data import fails, the
error message points at the Claude button; it does not press it. A fallback that
spends money whenever a free path fails is one the owner cannot budget for.
