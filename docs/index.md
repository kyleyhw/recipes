# Documentation

Design and rationale for the recipe management application. Start with
[architecture](architecture.md) for the shape of the system, or
[diagram](diagram.md) for the one part of a recipe file that has a grammar.

| Document | Covers |
| --- | --- |
| [architecture.md](architecture.md) | System shape, module boundaries, toolchain mapping, why the pure core is separated |
| [diagram.md](diagram.md) | The `## Diagram` grammar, the rules the table obeys, and what it renders as |
| [contributing-by-hand.md](contributing-by-hand.md) | Writing a recipe file yourself: every section, field and check |
| [data-model.md](data-model.md) | Prisma schema, the reasoning behind each non-obvious column |
| [self-hosting.md](self-hosting.md) | Running your own instance: local development and deployment |
| [nutrition-pipeline.md](nutrition-pipeline.md) | Ingredient resolution, USDA lookup, macro panel interpretation |
| [photos.md](photos.md) | Pictures: generating them, what they cost, the credit deadline, and keeping the key out of the repo |
| [sharing-format.md](sharing-format.md) | The portable recipe bundle and cross-instance import |
| [claude-integration.md](claude-integration.md) | The model features, the spend ceiling, and every failure mode |
| [log-and-history.md](log-and-history.md) | Per-recipe notes, revising by message, snapshots and restore |

How to add a recipe by pull request — and how the site works out whose it is —
is in [`CONTRIBUTING.md`](../CONTRIBUTING.md), which assumes you are handing the
job to a model; [contributing-by-hand.md](contributing-by-hand.md) is the same
ground for a person typing it themselves. Project status and the phase
breakdown live in [`PROJECT_PLAN.md`](../PROJECT_PLAN.md).

## Reading order

The system has one genuinely subtle part and a great deal of ordinary
application code. The subtle part is four pure modules — `units.ts`,
`quantity.ts`, `scaling.ts` and `nutrition/compute.ts` — which carry the
arithmetic and, with it, essentially all of the correctness risk. Their
reasoning is in their own comments, next to the code it constrains, rather than
in a separate document that can drift out of step with it. Everything else is
CRUD, storage, and user interface, and is documented where it is surprising
rather than exhaustively.
