# Sharing format

Instances of this application are independent deployments with no shared
storage, so sharing cannot be a database-level mechanism. It rests on a
versioned portable JSON document — a **bundle** — that one instance emits and
another consumes.

## Why the format looks like this

**Resolutions travel with the recipe.** Each ingredient carries its resolved
USDA identifier and a snapshot of its per-100 g macros, plus the density ρ and
per-item mass μ. The importing instance therefore has correct nutrition
immediately: no USDA key, no network call, no model call. Sending only the
ingredient text would make every import a re-resolution, and — worse — would let
two instances compute *different* numbers for the same recipe.

**Names, not identifiers.** Categories and tags travel as names. The receiving
instance's ids are its own; anything else is meaningless across the boundary.

**Unknown fields are ignored, not rejected.** A bundle from a newer instance may
carry fields this version does not understand. Importing what we can beats
refusing outright, so the schema is permissive on the way in.

## Shape

```jsonc
{
  "schema": "recipes.bundle",
  "version": 1,
  "exportedAt": "2026-08-10T12:00:00.000Z",
  "instanceUrl": "https://their-recipes.example.com",  // for attribution
  "shareId": "…",                                       // so an importer can link back
  "recipe": {
    "title": "Dal Tarka",
    "categoryName": "Soups & Stews",          // a name, not an id
    "tagNames": ["quick", "vegan"],
    "baseServings": 4,
    "servingLabel": "serving",
    "ingredients": [
      {
        "rawText": "200 g red lentils",   // never discarded
        "quantity": 200, "unit": "g", "name": "red lentils",
        "scalable": true, "optional": false,
        "ingredientName": "dried lentils",
        "macro": {                         // the snapshot that makes import instant
          "kcal100g": 353, "protein100g": 25.8, "carbs100g": 60.08, "fat100g": 1.06,
          "densityGPerMl": 0.8, "gramsPerUnit": null,
          "usdaFdcId": "172420", "sourceNote": "USDA SR Legacy 172420"
        }
      }
    ],
    "steps": ["Simmer the lentils.", "…"]
  }
}
```

A **collection** export (`schema: "recipes.collection"`) is the same thing with
a `recipes` array, and is read by the same import control.

## Three transports

1. **Share link.** `/r/<shareId>` — a public read-only page, reachable without a
   session, carrying the full working recipe: scaling, advisories, and the macro
   panel. A share link that shows less than the owner sees would be worse than a
   screenshot.
2. **Instance-to-instance.** The importer pastes that link into their own
   `/import` page. The application translates `/r/<id>` into
   `/api/public/recipes/<id>`, fetches it, and validates it. That endpoint is
   CORS-enabled and unauthenticated by design.
3. **File.** Download the bundle as `.json` and upload it elsewhere. Works when
   the source instance is private, offline, or gone, and doubles as backup — the
   whole-collection export uses the same code path.

## Share ids

16 random bytes as base64url: 128 bits, unguessable, so the public surface is
exactly the set of recipes the owner chose to share. The id is separate from the
recipe's primary key, so sharing one recipe never exposes an internal identifier
that could be used to probe for others.

Revocation nulls the id, which invalidates every circulated link immediately —
verified in the browser tests, along with the endpoint returning 404 in the same
instant. Nothing on the public path is cached, for this reason.

## Import behaviour

- Ingredients match the local library **by USDA identifier first, then by
  name**. The identifier is the stronger signal: two instances may spell an
  ingredient differently while meaning the same FDC record.
- A local ingredient is **never overwritten**. The importing instance's data,
  and in particular any manual correction it holds, outranks a visitor's
  snapshot.
- Genuinely new ingredients are created from the snapshot, so the recipe is
  accurate immediately.
- Imported recipes are saved as `DRAFT`. They came from someone else's kitchen
  and have not been cooked here.

## Versioning

`migrateBundle()` upgrades older documents. There is only one version so far, so
it is currently a pass-through — but it exists and is tested now, because the
alternative is discovering at version 2 that no upgrade path was ever designed
and every circulated bundle is dead.
