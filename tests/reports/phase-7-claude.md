# Test report — Phase 7: Claude integration

**Date:** 2026-08-10
**Scope:** the shared model client, strict tool schemas, generation,
substitution with a preview diff, text extraction, web-search photo sourcing,
Claude-assisted USDA matching, usage logging, and the monthly spend ceiling.

**Runtime:**

| Suite | Runtime |
| --- | --- |
| Full unit suite (243 tests, 14 files) | ~2.0 s |
| The four new files (63 tests) | 570 ms |
| `ai-pricing.test.ts` (10 tests) | 3 ms |
| `ai-schemas.test.ts` (21 tests) | 25 ms |
| `ai-diff.test.ts` (14 tests) | 6 ms |
| `html-text.test.ts` (18 tests) | 8 ms |
| Degradation browser flow (12 assertions) | ~9 s |
| Enabled-path browser flow (16 assertions) | ~24 s |
| Spend-ceiling browser flow (9 assertions) | ~11 s |
| Production build | 15 s |

---

## 0. The constraint this phase was verified under

**No `ANTHROPIC_API_KEY` was available in this environment**, and none was
obtained. Every claim below is therefore about code that does not depend on a
successful model response. What that leaves untested is stated plainly in §5
rather than glossed; it is the largest gap in the project's verification, and
pretending otherwise would be worse than the gap.

What this *did* allow, and what makes the coverage better than it sounds:

- The pure modules — pricing, schema generation, edit application, HTML
  reduction — are the parts carrying real logic, and they are tested directly.
- Running the application with a deliberately **invalid** key exercises the
  whole call path through the real SDK: the request is constructed, sent,
  rejected with a genuine HTTP 401, mapped through the typed error chain, and
  rendered as a sentence on the page. Only the model's *answer* is missing.
- The spend ceiling was tested end to end by writing a synthetic
  `AiInteraction` above the ceiling, which is exactly the state the ceiling
  exists to detect, and needs no API key to reach.

---

## 1. `ai-pricing.test.ts` — the arithmetic the ceiling rests on

The ceiling is the only thing between a deployed instance holding a live key and
an unbounded bill, and it is enforced entirely from this arithmetic. Every
expected value is hand-computed from the published prices rather than from the
implementation, so the test fails if the code and the price list disagree.

| Test | What it defends |
| --- | --- |
| One million input tokens costs the published input price | Chosen because it is the one input whose expected value *is* the published figure, with no arithmetic in between to get wrong |
| One million output tokens likewise | As above, for the other rate |
| Output-heavy costs more than input-heavy | A swapped input/output rate is invisible on a symmetric call and expensive on a real one, where output dominates |
| A realistic generation call costs \$0.0575 | 1,500 in + 2,000 out at \$5/\$25 — the actual shape of the most common call |
| The cheap model is exactly a fifth of the reasoning model | Pins the relationship the model-selection decisions were made on |
| Cache multipliers apply against the base input rate | 1.25× write, 0.1× read. Caching is not enabled; pricing it at zero would understate the bill the moment it is |
| Web searches are billed per search, independently of tokens | At two searches this is \$0.02, which **exceeds the entire token cost of the photo call** — the test asserts that ordering explicitly |
| A thousand small calls accumulate to \$0.30, not to zero | The failure this rules out is rounding per call: sub-cent calls would round away and the ceiling would never trigger |

## 2. `ai-schemas.test.ts` — the contract with the model

Two distinct failure modes, which is why the file is split in two.

**The generated JSON Schema.** A schema missing `additionalProperties: false`,
or with an incomplete `required`, is rejected at request time — so *every* AI
feature fails at once, with an error about a tool definition rather than about
anything the user did. These assertions are structural, walking every object
node of the generated document rather than checking named fields:

| Test | What it defends |
| --- | --- |
| Every object node in all five schemas is closed to unknown properties | Applied recursively, so a nested object added later is covered without a new test |
| Every property of every object is required | Same |
| `$schema` is stripped | Unrecognised keywords are not ignored — they are folded into the field description, where a dialect URL would arrive as instructions to the model |
| A `.optional()` field is still emitted as required | Proves this is a *transform*, not an assertion about the schemas that happen to exist today |
| `.nullable()` survives as a nullable type | "Not applicable" must remain sayable |
| Field descriptions reach the tool definition | The descriptions are the instructions the model actually reads; a schema that dropped them would still validate and would quietly produce worse recipes |

**The validation.** These values become recipes, macros, and image fetches:

| Test | What it defends |
| --- | --- |
| A well-formed recipe validates | Baseline |
| A recipe missing `steps` is rejected | A partial answer must not become a recipe |
| `null` is accepted where allowed; an *absent* field is not | The distinction is load-bearing: `prepMinutes: null` means "considered and not meaningful", a missing field means the answer is incomplete |
| `"four"` is rejected for `baseServings` | Coercion would put a string into the denominator of the scaling factor |
| An unlisted `confidence` value is rejected | The enum is the contract |
| `choiceIndex: -1` validates | Rejecting every USDA candidate is the *honest* answer and must be as easy to express as a match |
| A bare URL string is rejected as a photo candidate | Shape errors must not reach the fetcher |

## 3. `ai-diff.test.ts` — applying a substitution

All the interesting behaviour is in the failure cases. A silently misapplied
substitution produces a recipe that looks complete and is wrong, discovered
while cooking from it.

| Test | What it defends |
| --- | --- |
| Names a line, replaces that line, leaves the rest | Baseline |
| Matches through case, extra spacing, surrounding space | Exactly how a *reproduced* line differs from a *copied* one; refusing these would fail on the most common near-miss |
| Matches through typographic apostrophes and dashes | Same class of difference |
| An exactly-named line goes to the edit that names it exactly | A sloppy edit must not consume the line another edit names precisely — the reason exact matching is resolved across all edits first |
| **An unmatched edit changes nothing and is reported** | The central assertion. Appending it, or attaching it to the nearest line, is the failure this module exists to prevent |
| Partial application reports both halves | The realistic case: some edits land, some do not |
| **`butter` does not match `250 ml buttermilk`** | Substring matching would substitute the wrong ingredient. Chosen because these two words genuinely collide in an ordinary recipe |
| Two edits naming one line do not compound | Each line is edited at most once |
| The input array is not mutated | The caller still needs the original to render the diff |

## 4. `html-text.test.ts` — what is sent to the model

| Test | What it defends |
| --- | --- |
| Script/style/noscript *contents* removed, not just the tags | A stripped `<script>` would dump its source into the middle of the recipe and be billed as input tokens |
| Attributes go with their tags | Tracking URLs are not recipe text |
| `<li>` and `<p>` become line breaks | An ingredient list flattened onto one line is materially harder to read back as a list |
| Runs of blank lines collapse | Recipe pages are full of empty wrapper divs, and whitespace is billed like anything else |
| Five entities decode; **the ampersand decodes last** | Decoding it first turns the escaped text `&amp;lt;` into `<` rather than the literal `&lt;` the document contained |
| Three kinds of malformed markup survive | Recipe sites publish plenty. A parser that threw would turn a recoverable import into an error page; this degrades to ragged text, which a language model reads perfectly well |

---

## 5. Browser verification

Chromium at 390×844, against the real PGlite Postgres — the size this
application is used at, standing at a counter.

### 5.1 Degradation with no key — 12 assertions, all passed

The claim being tested is that the AI features **do not appear** rather than
appearing and failing. A hidden control cannot be pressed by mistake, and a
clone with three environment variables is a complete recipe box.

| Assertion | Result |
| --- | --- |
| No **Generate** link in the header | PASS |
| The non-AI links are all present | PASS |
| `/generate` redirects to the collection rather than erroring | PASS |
| No **Substitute** link on a recipe | PASS |
| No Claude photo control | PASS |
| `/recipes/…/substitute` redirects rather than erroring | PASS |
| No **Read it with Claude** button on the import page | PASS |
| The free import paths (URL, file, share link, paste) all remain | PASS |
| No budget note where there is no spending to do | PASS |
| Ordinary controls, the macro panel, and scaling all still render | PASS |

### 5.2 The enabled path, with a deliberately invalid key — 16 assertions, all passed

Restarting with `ANTHROPIC_API_KEY` set to an invalid value makes
`features.ai` true, which reveals every control and sends every request for
real. The API returns a genuine 401, so this exercises the request path, the
typed error chain, and the rendering of a failure — everything except the
model's answer.

| Assertion | Result |
| --- | --- |
| **Generate** appears in the header | PASS |
| `/generate` renders; budget note reads \$0 against a \$10 ceiling | PASS |
| Generation failure renders as *"The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."* | PASS |
| The form is still usable afterwards — no error page, no lost state | PASS |
| **Substitute** link and Claude photo control appear on a recipe | PASS |
| The substitution page renders its form | PASS |
| A failed proposal renders the same sentence | PASS |
| **No apply form is offered when there is no proposal** | PASS |
| Photo failure returns to the recipe with the reason | PASS |
| The recipe still renders its image or placeholder after the failure | PASS |
| **Read it with Claude** appears on the import page and fails in words | PASS |
| **Zero `AiInteraction` rows were written** | PASS |

The last is the one worth dwelling on: a request rejected at authentication
never reached the model, so nothing was billed, so nothing was recorded. Usage
logging that fired on attempt rather than on response would have inflated the
ceiling with calls that cost nothing.

### 5.3 The spend ceiling — 9 assertions, all passed

Tested by writing a synthetic `AiInteraction` of \$15 against a \$10 ceiling —
the exact state the ceiling exists to detect, reachable with no API key. The row
was deleted afterwards.

| Assertion | Result |
| --- | --- |
| The budget note reads \$15.00 and says the ceiling has been reached | PASS |
| Generation is refused with *"This month's Claude spend (\$15.00) has reached the ceiling of \$10.00. Raise AI_MONTHLY_BUDGET_USD to continue."* | PASS |
| **The refusal is not an API error** — the key was never used | PASS |
| **The refusal took 167 ms**, so no billable call was made | PASS |
| Substitution is refused by the same ceiling | PASS |
| Photo sourcing is refused by the same ceiling | PASS |
| Browsing, scaling, and macros are entirely unaffected | PASS |

The timing assertion is the substantive one. A ceiling checked *after* the call
would be indistinguishable from this one in its message and useless in its
effect; 167 ms is far too fast for a model round trip, so the check demonstrably
precedes the spending. Checking all three entry points rather than one confirms
the ceiling lives in the shared client rather than in whichever feature was
written first.

---

## 6. Not covered

Stated explicitly, in the same spirit as the Phase 5 report's note on the
untested USDA surface.

**Everything downstream of a successful model response.** With no valid key,
none of the following has been exercised against the real API:

1. **That the API accepts the request bodies.** A 401 is returned before the
   body is validated, so the tool definitions, `thinking: {type: "adaptive"}`,
   `output_config.effort`, and the `web_search_20260209` declaration are
   unverified against the service. They are written against the SDK's own
   TypeScript types and compile clean, which is weaker evidence than a
   successful call.
2. **Usage recording and cost attribution.** `recordUsage` has never run on a
   real `usage` object. The arithmetic it calls is unit-tested; the mapping from
   the response's usage fields into it is not.
3. **Schema validation of real answers**, and therefore the one-retry correction
   path. It is unit-tested that malformed input fails validation, and untested
   that a correction turn recovers.
4. **`pause_turn` resumption** in the web-search loop.
5. **Answer quality** — whether generated recipes honour the memories, whether
   substitution ratios are right, whether the model picks the correct USDA
   record. These are not testable by assertion in any case and need a person
   cooking from the output.
6. **Photo candidate ingestion end to end.** The ingest pipeline itself was
   verified in Phase 3 against real images; what is untested is that the URLs
   Claude's web search returns are the kind that survive it.

**How to close it.** Set a real `ANTHROPIC_API_KEY` and run one of each: a
generation, a substitution, a photo search, an import. The first will populate
`AiInteraction`, which makes items 1–2 verifiable by inspection, and the budget
note on `/generate` will show a non-zero figure. The failure paths tested above
are the ones that would otherwise be found in production.

---

## 7. A note on the resolution chain change

Phase 7 modified `lib/nutrition/resolve.ts`, which Phase 5 verified. The change
adds two optional steps at the *end* of the chain — Claude choosing among USDA
candidates, and Claude estimating when FoodData Central has no record — and
widens the USDA candidate list from 1 to 8 when an Anthropic key is present.

With no key, the behaviour is byte-for-byte what Phase 5 tested: the candidate
list stays at 1 and the top hit is adopted. The full unit suite, including the
Phase 5 nutrition tests, passes unchanged, and the browser flow in §5.1
re-confirms the macro panel renders from the local library with no key set.

One deliberate asymmetry is worth recording: a *failed* Claude call falls back
to the top USDA hit, while an explicit `choiceIndex: -1` does not. The two look
alike in the code (`chosen === null` in both cases) and mean opposite things. A
failure means no judgement was available, so the pre-Claude behaviour is
correct; a rejection means the judgement was made and was negative, and adopting
the top hit anyway would override the only thing that was asked for.
