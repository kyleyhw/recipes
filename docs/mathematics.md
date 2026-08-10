# Mathematics

Three components of this application have genuine mathematical content: unit
conversion, quantity rendering, and macronutrient aggregation. Everything else
is CRUD, interface, and glue, and is documented in
[architecture.md](architecture.md) at the algorithmic level only.

Each section states the formulation, then the algorithm chosen, then why the
obvious alternative was rejected.

---

## 1. Unit conversion

### Formulation

Let $U$ be the set of supported units, partitioned by physical dimension:

$$U = U_m \sqcup U_v \sqcup U_c$$

for mass, volume, and count. Within a dimension, each unit $u$ carries a fixed
conversion factor $\lambda_u > 0$ to that dimension's base unit (gram,
millilitre, item). A quantity $(q, u)$ has canonical magnitude

$$\tilde q = q\,\lambda_u .$$

Conversion within a dimension is therefore the scalar map

$$q \;\longmapsto\; q\,\frac{\lambda_{u_1}}{\lambda_{u_2}},$$

an action of the multiplicative group $(\mathbb{R}_{>0}, \times)$: associative,
with identity $\lambda_u/\lambda_u = 1$, and exactly invertible up to
floating-point representation.

### Algorithm

A lookup table of $\lambda_u$, and one multiplication. Nothing more.

**Rejected alternative.** This problem is often modelled as a graph, with units
as vertices and conversions as weighted edges, solved by search for a path
between two units. That structure is unnecessary: because every unit in a
dimension has a factor to a *common* base, the graph is a star, and any path
through it collapses to the single product above. Graph search here would buy
nothing and would introduce path-dependent floating-point behaviour, where
converting cups → tablespoons → millilitres could disagree with cups →
millilitres.

### Crossing dimensions

Cross-dimensional conversion is **not** a property of the unit. It is a
property of the substance:

$$m = \rho V \quad (\rho = \texttt{densityGPerMl}), \qquad
m = \mu n \quad (\mu = \texttt{gramsPerUnit}).$$

A millilitre of flour and a millilitre of honey differ, so no table keyed on
"ml" can express the conversion. Both $\rho$ and $\mu$ are therefore stored per
canonical ingredient, not in `units.ts`.

Where $\rho$ or $\mu$ is unknown for an ingredient, the conversion is
**undefined**, and the ingredient is reported as a coverage gap (§3). It is not
given a default. A plausible default would be indistinguishable from real data
in the totals, which is precisely the failure this design exists to avoid.

### Magic numbers

Every $\rho$ is a magic number under the project's standards and carries a
sourced comment at its definition — for example all-purpose flour
$\rho \approx 0.53\ \mathrm{g\,ml^{-1}}$ (spooned and levelled; the figure
varies by roughly 15% with packing method, which is itself a reason to prefer
mass measurements where a recipe offers them), water $\rho = 1.00$.

---

## 2. Quantity rendering

Scaling a recipe by

$$\alpha = \frac{S_\text{target}}{S_\text{base}}$$

maps each scalable quantity $\tilde q \mapsto \alpha\tilde q$. That part is
trivial. The mathematically interesting step is rendering the result as a
measurement a cook can actually execute.

### Formulation

Kitchen measuring equipment realises only a small set of denominators —
halves, thirds, quarters, sixths, eighths:

$$D = \{1, 2, 3, 4, 6, 8\}.$$

Given a target magnitude $x > 0$ in a candidate unit, we seek

$$(p^\*, q^\*) \;=\; \operatorname*{arg\,min}_{q \in D,\; p \in \mathbb{Z}_{>0}}
\left| x - \frac{p}{q} \right|,$$

with ties broken toward smaller $q$: a cook prefers $\tfrac12$ to $\tfrac48$.

### Algorithm

For fixed $q$, the optimal numerator is immediate:

$$p = \operatorname{round}(qx).$$

So the search is over $|D| = 6$ candidates, each costing one multiplication and
one rounding. The algorithm is $O(|D|)$ and exact.

### Why not continued fractions

The textbook solution to best rational approximation is the continued-fraction
expansion, whose convergents $p_k/q_k$ are optimal in a strong sense: no
rational with denominator $\le q_k$ lies closer to $x$.

That optimality is over **all** denominators, which is the wrong feasible set.
The best convergent to $0.5385$ is $7/13$ — an excellent approximation, and
useless, because no measuring spoon realises thirteenths. Constraining to $D$
turns an elegant infinite algorithm into a six-element search, and makes the
constrained problem strictly *easier* than the unconstrained one. This is a
case where reaching for the standard tool produces a worse answer than the
naive one.

### Unit selection

Rendering also chooses the unit. Let $C \subseteq U$ be the candidate units of
the correct dimension. The displayed unit is the largest for which the count is
at least one:

$$u^\* = \operatorname*{arg\,max}_{u \in C}
\left\{ \lambda_u \;:\; \tilde q / \lambda_u \ge 1 \right\}.$$

That rule alone turns out to be wrong in three ways, each found by testing the
implementation against what a cook would actually want to read. The rule the
code implements is the corrected one below.

**Correction 1 — never cross measurement systems.** $500\ \mathrm{g}$ is
$1.102\ \mathrm{lb}$, which snaps to $1\tfrac18$ lb within tolerance. The
arithmetic is right and the answer is wrong: the cook is following a metric
recipe with a metric scale out. Candidate units are therefore filtered to the
system of the unit the recipe was written in. Crossing systems is a conversion
the user asks for, not something scaling does behind their back.

**Correction 2 — metric does not take fractions.** $\tfrac23\ \mathrm{kg}$ is
not something anyone writes; metric measurement exists precisely to avoid
fractions. Metric quantities climb the unit ladder only to keep the number in
$[1, 1000)$ and are then rendered as decimals.

**Correction 3 — simplicity beats size.** The largest-unit rule prefers
$\tfrac13$ tbsp to $1$ tsp for $5\ \mathrm{ml}$, and $6\tfrac18$ fl oz to
$\tfrac34$ cup for $180\ \mathrm{ml}$. Both are backwards: a whole number in a
smaller unit is easier to measure than a fraction in a larger one, and twelve
scoops is not a measurement at all. Imperial selection therefore admits only
units placing the value in a *comfortable range* $[\tfrac14, 4]$ — a quarter cup
is a real measuring cup, a twentieth of one is not, and nobody counts twelve
tablespoons — and among those chooses the **simplest denominator**, breaking
ties toward the larger unit.

With those corrections, $887\ \mathrm{ml}$ in an imperial recipe renders as
$3\tfrac23$ cups. (An earlier draft of this document asserted $3\tfrac34$;
that was simply wrong. $887/240 = 3.696$, whose nearest member of $D$ is
$3\tfrac23$ at $0.79\%$ error, against $1.46\%$ for $3\tfrac34$.)

Every candidate is scored by relative error

$$\varepsilon_\text{rel} = \frac{|x - p/q|}{x}$$

against a tolerance $\varepsilon$, and the renderer falls back to one decimal
place when no candidate satisfies it.

$\varepsilon = 0.05$ is used. The justification is physical rather than
mathematical: a 5% error on a one-cup measure is about one teaspoon, which is
below the reproducibility of domestic measurement — the same cook filling the
same cup twice varies by more than that. Tightening it produces uglier numbers
with no real gain in fidelity. It is a named constant, not a literal.

### Non-linearity

$\tilde q \mapsto \alpha \tilde q$ is correct for *extensive* quantities: bulk
masses and volumes. It is wrong for several recipe parameters:

- **Chemical leavening.** Gas production scales with the leavener, but the
  batter's capacity to retain it does not scale identically.
- **Salt in fermented doughs.** Salt regulates yeast activity; the relationship
  to fermentation rate is not proportional.
- **Bake time.** Governed by heat diffusion into the mass, not by the mass.
- **Vessel geometry.** For a fixed pan footprint, depth scales as $\alpha$; for
  a fixed shape, linear dimensions scale as $\alpha^{1/3}$.

The application does **not** model any of this. Doing so correctly is a
research problem, not a feature, and a plausible-looking correction factor
would be fabricated precision — worse than no correction, because it would be
trusted.

Instead, affected ingredients are flagged when

$$|\log \alpha| > \tau$$

for a threshold $\tau$, and the judgement is left to the cook. The logarithm is
the right measure because scaling is multiplicative: halving and doubling are
equally large departures from $\alpha = 1$, and $|\log\alpha|$ treats them so
while $|\alpha - 1|$ does not.

---

## 3. Macronutrient aggregation and coverage

### Formulation

Let a recipe have ingredients $i = 1,\dots,n$ with resolved masses $g_i$ in
grams and per-100 g macro vectors $\mathbf{m}_i \in \mathbb{R}^k$ (energy,
protein, carbohydrate, fat, fibre, sugar, sodium). Totals are the linear
combination

$$\mathbf{M} = \sum_{i=1}^{n} \frac{g_i}{100}\, \mathbf{m}_i,
\qquad \mathbf{M}_{\text{serving}} = \frac{\mathbf{M}}{S}.$$

Storing macros per 100 g — the USDA convention — is what makes this a plain
linear combination with no per-row unit handling.

### An exact invariant, used as a test

Under scaling by $\alpha$, both the masses and the serving count scale:
$g_i \mapsto \alpha g_i$ and $S \mapsto \alpha S$. Hence

$$\mathbf{M}_{\text{serving}}(\alpha)
= \frac{1}{\alpha S}\sum_i \frac{\alpha g_i}{100}\mathbf{m}_i
= \frac{1}{S}\sum_i \frac{g_i}{100}\mathbf{m}_i
= \mathbf{M}_{\text{serving}}(1).$$

**Per-serving macros are invariant under portion scaling.** This is an exact
algebraic identity, which makes it an unusually good property test: asserting
equality across a range of $\alpha$ catches any bug in the scaling or
aggregation path *without requiring a single hand-computed expected value*.
Tests that depend on hand-computed values test the author's arithmetic as much
as the code; this one cannot.

The test uses $\alpha \in \{0.5, 1, 2, 3.7\}$. The value $3.7$ is chosen
deliberately as non-dyadic and non-integer: dyadic factors can mask errors in
fraction handling that happen to land on realisable denominators anyway.

### Coverage, not confidence

When some ingredients fail to resolve, the honest report is not a count of how
many matched. Counting weights a pinch of salt equally with 500 g of flour, so
"10 of 12 matched" can describe a total that is either essentially complete or
essentially meaningless.

Define **mass coverage**

$$c = \frac{\sum_{i \in R} g_i}{\sum_{i=1}^{n} g_i} \in [0,1],$$

where $R$ is the resolved subset.

There is a circularity in the denominator: computing $\sum_i g_i$ over *all*
ingredients requires knowing the mass of ingredients we could not resolve. The
resolution is to distinguish two failure modes, which are genuinely different:

1. **Mass known, macros unknown** — the quantity is given by mass directly, or
   $\rho$/$\mu$ is available, but no macro data was matched. These contribute
   to the denominator, and $c$ accounts for them correctly.
2. **Mass unknown** — no $\rho$ or $\mu$, so the ingredient's mass cannot be
   determined at all. These cannot enter the denominator without inventing a
   figure, so they are reported separately, as a count, alongside $c$.

The interface therefore reports $c$ as a percentage *and* the residual count,
because neither alone is the whole truth.

Unresolved ingredients contribute zero to $\mathbf{M}$ but are never presented
as nutritionally zero. The difference between "contains no fat" and "we do not
know its fat content" is the entire reason this metric exists.

### Reading the macro panel

Composition is displayed as a stacked bar of *energy* contribution by
macronutrient, using the Atwater factors

$$4\ \mathrm{kcal\,g^{-1}}\ \text{(protein)},\quad
4\ \mathrm{kcal\,g^{-1}}\ \text{(carbohydrate)},\quad
9\ \mathrm{kcal\,g^{-1}}\ \text{(fat)}.$$

The bar is energy-weighted rather than mass-weighted on purpose: fat is
slightly over twice as energy-dense as the others, so a mass-proportioned bar
systematically understates its contribution to the figure most people are
reading the panel for. The axis is percentage of total energy; the interpretive
takeaway is the *shape* of the split, not the precise boundaries, since the
underlying database figures themselves carry uncertainty of several percent.

Interpretation guidance is repeated at the point of display in
[nutrition-pipeline.md](nutrition-pipeline.md).
