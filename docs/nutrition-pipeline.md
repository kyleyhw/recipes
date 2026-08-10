# Nutrition pipeline

> **Status: phase 5.** The design is settled and derived in
> [mathematics.md §3](mathematics.md#3-macronutrient-aggregation-and-coverage);
> this document is completed when the implementation lands.

Planned shape, per ingredient:

```
rawText -> parse -> resolve to canonical Ingredient -> convert to grams -> aggregate
```

Resolution order: the local `Ingredient` library (exact, then trigram-fuzzy),
then a USDA FoodData Central search, then Claude selecting among the USDA
candidates. A permanent manual override at the `Ingredient` level always wins
and is never overwritten by an automatic pass.
