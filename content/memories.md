# Memories

Standing instructions for this collection. They apply to every recipe written,
adjusted or imported into it — stated once here rather than remembered each
time.

They are a file like everything else, so changing one is a commit, and the
history says when a preference changed and why.

## This repository is public

Everything committed here is world-readable, and git makes it permanent: a file
deleted in the next commit is still in the history. Nothing goes in that would
not be fine on a noticeboard.

- **No keys, ever.** The site needs none to build or to read; `ANTHROPIC_API_KEY`
  is used only by `npm run translate`, on the machine that runs it. It belongs
  in `.env`, which is ignored.
- **The Log is public.** It is a cook's log — what needed more salt, what
  burned — not a diary.
- **Credit what came from elsewhere.** A recipe taken off a website records its
  `source`, and one taken from a person records who.
- **Photographs are generated, and the page says so.** Sourcing them from the
  web was decided when this was a private collection; a public repository
  redistributes whatever it holds, which is a different question from looking at
  a picture at home. The answer taken instead is `npm run photos`, which draws
  one with an image model — no third party's copyright, and no cost at read
  time, since the file is committed like everything else.

  Money and a deadline, both written up in [docs/photos.md](../docs/photos.md):
  the collection costs about $1.83 to draw at August 2026 prices, covered by the
  $10/month of Cloud credits a Google AI Pro subscription carries — **and that
  subscription ends at the end of August 2026**. The model in use retires on
  2 October 2026. Every run prints its estimate first and refuses to pass a
  spend ceiling that defaults to $5, so this cannot quietly become expensive.

  What it costs is that **the picture is not evidence**. A model has never
  cooked anything; what comes back matches the words, not the dish, and it was
  not made from this recipe by anyone. So every generated image carries a credit
  saying it was generated, in the place a photographer would have been credited,
  and that line is not optional. A photograph actually taken here is better than
  any of them and should replace one whenever it exists.

## Recipes are attributed from git

Every recipe page says who added it, and that comes from the commit that added
the file — not from a field in it. Nobody fills anything in, and nobody can get
it wrong. See [`src/lib/content/attribution.ts`](../src/lib/content/attribution.ts).

- **Never add an `addedBy:` field.** A second copy of something git already
  holds is a second copy that can disagree with the first, and the one written
  by hand is the one that will be wrong.
- **A recipe someone else sent is committed as theirs, or credited in the
  notes.** Committing it under this account makes the site say it was added
  here, which is a small lie that nothing will ever correct. A pull request is
  the easy path: merge it and the credit is right by construction.
- **Squash-merging is fine**; GitHub keeps the contributor as the commit's
  author. Rewriting history is not — a rebase that re-authors someone's commit
  takes their name off their recipe.
- **The build needs the whole history**, which is why the Pages workflow sets
  `fetch-depth: 0`. Without it the site shows no attribution at all, by design:
  a shallow clone would credit every recipe to whoever pushed last.

## Taste

- **Strong, assertive flavours.** Season properly. Where a recipe suggests a
  cautious amount of chilli, acid, garlic or spice, take the upper end. A dish
  that tastes of nothing is a failure even if it is technically correct.

## How a recipe must be written

- **Steps must be unambiguous, direct and straightforward.** Say exactly what to
  do, to what, and for how long. Temperatures, pan sizes and heat levels are
  numbers, not adjectives. Every step that ends gives a sensory cue for how to
  tell it is done — what it looks, smells or sounds like. No hedging: never
  "about", "or so", or "until done".

- **Storage and reheating instructions, where they apply.** How long it keeps
  and in what; whether it freezes and how to defrost it; how to bring it back
  without ruining it. Most of what gets cooked is eaten again the next day, and
  a recipe that stops at the moment of serving has stopped halfway. Where a dish
  genuinely must be eaten immediately, say that instead — it is the same
  question, answered.

- **Every ingredient a recipe uses must exist in the library.** Adding a recipe
  means adding any ingredient it introduces to `content/ingredients.json`, with
  its density or grams-per-item where it is measured by volume or by count, and
  with a sourced note for every figure. A missing entry does not fail the build;
  it quietly drops that ingredient out of the nutrition figures and shows up
  later as a coverage gap on the recipe page. The gap is always a missing row,
  never a limit of the arithmetic.

  **And nothing beyond that.** The library is not a food database — USDA is the
  food database — it is the subset these recipes need. A row no recipe uses is a
  sourced claim nobody will ever check again, so the tests fail on one. Delete a
  recipe and its private ingredients go with it.

- **An ingredient has to be buyable, not already listed.** The test for putting
  something in a recipe is whether it can be got from an ordinary supermarket or
  an ordinary Asian supermarket — not whether `content/ingredients.json` happens
  to have a row for it. Adding a row is half an hour of sourcing; a recipe bent
  out of shape to avoid adding one is wrong forever, and it is the more
  tempting mistake because the tests notice the missing row and cannot notice
  the compromised dish.

  **Buyability is the only test.** Not how many rows the library already has,
  not how many a recipe would add, not whether a near-enough row exists. A
  dish that needs nine new ingredients gets nine new ingredients. The sourcing
  is work; bending the dish is damage.

  What this rules out is the genuinely specialist: an ingredient that needs a
  trip to one shop in one city, or an online order, belongs in the notes as a
  variation and not in the ingredient list. Where a dish is defined by something
  like that, say so and give the version that can actually be cooked.

  **When something is refused, the recipe says so.** Never substitute silently.
  Name what is missing, name what stands in for it, and say how the two differ —
  a reader who can get the real thing should be able to tell from the notes what
  to do with it. Worked examples, all from the Yunnan recipes:

  | Added, because it is on a shelf | Refused, and named in the notes instead |
  |---|---|
  | mixian, chinese chives, pea shoots | Yunnan ham (宣威火腿) — left out, not substituted |
  | quail eggs, roasted peanuts, tofu puffs | fresh douhua — warmed silken tofu instead |
  | laksa paste, sour soup base, kecap manis | Yunnan sweet soy (甜酱油) — kecap manis instead |
  | chicken fat | laksa leaf (daun kesum) — left out |

- **A packet is an ingredient.** Japanese curry roux, suan cai yu kits, hot pot
  base, laksa paste, instant dashi: where a ready-made packet is what people
  actually use — and for several dishes it is what the dish *is*, since nobody
  is blending twelve spices on a Tuesday — the recipe calls for the packet.
  Write it as the thing on the shelf, name the sort of brand, and let the row's
  `sourceNote` carry the uncertainty, because composition varies far more
  between brands than a single ingredient does. Scratch versions go in the notes
  for anyone who wants them.

- **Counts are derived, never written.** "400 g white cabbage" is what the
  recipe says; "(about 1 head)" is what the page adds, from mu and the row's
  `unitName`. Do not type the count into the ingredient line, because a typed
  one is right at four servings and a lie at eight, while a derived one moves
  with the stepper. The same goes for the packets a reconstituted liquid takes:
  dashi and stock carry a `madeUp` rate — how far one sachet or cube goes — and
  the line works out how many and how much water from there.

  Two rules follow. A `unitName` is only ever added where mu is real, since a
  noun with no number behind it shows nothing; and a line that already carries
  a bracket keeps it and gets no derived count, because "2 short ones" says
  something mu cannot and two brackets disagreeing is worse than either alone.

  The count is also a check on the data. Udon was recorded at 150 g a portion
  until the bracket read "2½ portions" on a two-portion dish and gave itself
  away; the pack is 200 g. A figure nobody looks at is a figure nobody
  corrects.

- **What a recipe rules out is derived, and lives on the ingredient.** Every
  row in `content/ingredients.json` can carry an `excludes` list — `pork`,
  `fish`, `dairy`, `sesame`, `gluten` and the rest — and a recipe's dietary
  filters are worked out from its ingredients at build time. Never add a
  `vegetarian:` field to a recipe. A field like that is a claim somebody typed
  once and nobody checks again; add oyster sauce two months later and it still
  says vegetarian.

  **Adding an ingredient means asking what it rules out**, and the answer is
  usually nothing — vegetables, spices, sugar and water carry no tags. The ones
  that matter are the ones nobody sees coming: dashi is a fish stock, oyster
  sauce is shellfish, gelatine is boiled from hide, soy sauce is brewed with
  wheat, Parmigiano Reggiano is made with calf rennet, and crisp chilli oil has
  peanuts in it. Where the tag depends on the brand, take the common case and
  say so in the row's `sourceNote`.

  **It is not an allergen guarantee and must never be written as one.** It
  reads an ingredient list in a Markdown file, not a label on a jar, and the
  wording on the site says exactly that. An unresolved ingredient makes a
  recipe satisfy no diet rather than all of them.

- **Time is written as a sum**: `10 min prep + 15 min drain = 25 min total`,
  not a row of middots. The parts add up to the total, so the line says so, and
  the equals sign invites the reader to check it — which is why
  `formatDuration` never rounds. See `lib/duration.ts`.

- **A perishable ingredient carries a `keeping` note.** The recipe says how to
  store the dish; the library says how to store what the dish did not use, which
  is the part that actually gets thrown away — three quarters of a cabbage, half
  a bunch of coriander, the rest of the packet of mince. It lives on the
  ingredient because ginger is in ten recipes and ten copies of the same
  paragraph would be ten paragraphs to keep in step.

  Write it the way a recipe step is written: a place, a time, and the trick that
  actually extends it — "three weeks in the fridge unpeeled, in a paper bag;
  better, freeze it whole and grate it from frozen". Where it matters, say how
  to tell it has gone. A note that says "store in a cool dry place" is worse
  than no note, and the tests reject one under forty characters for that reason.
  Salt, sugar, flour and water do not need one.

- **Every recipe needs a diagram**, and it must obey the eleven rules in
  [docs/diagram.md](../docs/diagram.md). Four are worth remembering while
  writing one:

  - an operation's box spans **exactly** the ingredients it consumes;
  - those ingredients must be a **contiguous** block of rows;
  - so the left column, read downward, is the order things **enter** the
    recipe — not the order the ingredient list happens to use;
  - **labels stay short** — two or three words, a number only where the number
    is the point. The detail is in the method; the diagram is the shape;
  - and a **sequence is a chain, not a fan**. "Whisk in the sugar, then the
    eggs, then the bananas" is three operations. Drawing it as one node with
    four inputs loses the ordering the instruction exists to convey.

  Leaves that name an ingredient pick up its scaled quantity and translated
  name automatically, so write them as the ingredient is written. Where an
  ingredient is split across two uses, write it as a fraction — `1/3 peanut
  oil` — and the diagram shows what that fraction comes to and rescales it.

  **A split ingredient must not carry a bracketed count.** The bracket
  describes the whole — "400 g Chinese cabbage (a quarter head)" — and the
  diagram prints it against each part, so the half-portion cell reads
  "240 g Chinese cabbage (a quarter head)", which is a lie about both numbers.
  Brackets are for ingredients that go in all at once.

- **Notes, Storage and the Log are plain text, not Markdown.** They are rendered
  with the line breaks kept and nothing else interpreted, so `**bold**` shows as
  asterisks and `[a link](to.md)` shows as brackets and a filename. Write them as
  prose. Both of those have shipped and been caught on the rendered page rather
  than in a test — which is the same lesson as the one below.

  **Name another recipe by its title and the site links it for you.** Write
  "or Roast Meat Soy Dressing" exactly as the title is written and it becomes a
  link to that recipe, in Notes and in Storage — nothing is added to the file to
  make that happen, so it stays readable as plain text on GitHub and in an
  editor. Matching is exact in its words, case-sensitive, and forgiving only
  about the line break a hard-wrapped paragraph puts in the middle of a title.
  Rename a recipe and its old name stops linking, silently, which is the cost of
  the whole arrangement.

- **Look at a diagram before calling it good.** Build the site, open the recipe
  and read the rendered table against the method. Do not judge it from the
  outline: an outline that is obviously right on the page is regularly wrong in
  the table, because indentation reads as grouping and the table reads as
  geometry, and those are not the same picture.

  `npm test` catches a missing diagram, a forgotten ingredient and shares that
  do not add up. It cannot catch the three that matter most, and those are
  exactly the ones that need eyes on the rendered page:

  - **the row order** — does the left column, read downward, match the order
    the method introduces things?
  - **chain or fan** — is a sequence drawn as a sequence, or collapsed into
    one node with four inputs?
  - **the labels** — is anything long enough to force a wide column, and has a
    scrollbar appeared as a result?

  Screenshot it. Every diagram that has gone wrong here has looked fine as an
  outline and looked wrong immediately as a picture.

- **The time on the card is the time it takes**, waiting included. `prepMinutes`
  and `cookMinutes` are the two stretches you have to be there for;
  `waitMinutes` is the fridge, the prove, the marinade, the twelve hours of
  drying — and the card adds all three and prints the total. A mango pudding is
  fifteen minutes of work and nobody eats it for four hours, and advertising it
  as twenty minutes is the card lying about the only question it is being
  scanned for.

  Two rules follow. Count only waiting that actually makes you wait: a marinade
  sitting while something else simmers costs no wall-clock time and belongs in
  the method alone. And the numbers must **add up exactly as printed** — the
  parts and the total sit on one line, so any rounding that makes the sum
  disagree with its addends is an arithmetic error a reader can see, and
  `lib/duration.ts` is exact for that reason and no other.

- **Say which China.** `cuisine` is what the filter offers, so it should be as
  specific as the dish honestly allows — `Cantonese` for a dish that is one,
  `Chinese` where it is genuinely pan-regional or where the honest answer is
  that you are not sure. Twenty-five Cantonese recipes filed under `Chinese`
  alongside a Sichuan mapo tofu is a filter that cannot answer the question
  anybody is asking it. Guessing more precisely than you know is the other
  failure: a dish nobody can place stays `Chinese`.

- **Baked goods must state their tin**, and scale it. A cake batter doubled into
  the same tin is twice as deep and bakes wrongly: the outside sets before the
  middle is done. `lib/tin.ts` scales the tin with the recipe — area with the
  serving count, so linear dimensions go as its square root.
