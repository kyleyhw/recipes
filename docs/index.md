# Documentation

Design and rationale for the recipe management application. Start with
[architecture](architecture.md) for the shape of the system, or
[mathematics](mathematics.md) for the derivations behind scaling and nutrition.

| Document | Covers |
| --- | --- |
| [architecture.md](architecture.md) | System shape, module boundaries, toolchain mapping, why the pure core is separated |
| [mathematics.md](mathematics.md) | Unit conversion, constrained rational approximation, macro aggregation and coverage |
| [data-model.md](data-model.md) | Prisma schema, the reasoning behind each non-obvious column |
| [self-hosting.md](self-hosting.md) | Running your own instance: local development and deployment |
| [nutrition-pipeline.md](nutrition-pipeline.md) | Ingredient resolution, USDA lookup, macro panel interpretation |
| [sharing-format.md](sharing-format.md) | The portable recipe bundle and cross-instance import |
| [claude-integration.md](claude-integration.md) | The model features, the spend ceiling, and every failure mode |
| [log-and-history.md](log-and-history.md) | Per-recipe notes, revising by message, snapshots and restore |

Project status and the phase breakdown live in
[`PROJECT_PLAN.md`](../PROJECT_PLAN.md).

## Reading order

The system has one genuinely subtle part and a great deal of ordinary
application code. If you are here to understand the subtle part, read
[mathematics.md](mathematics.md) and the four pure modules it describes
(`units.ts`, `quantity.ts`, `scaling.ts`, `nutrition/compute.ts`). Everything
else is CRUD, storage, and user interface, and is documented where it is
surprising rather than exhaustively.
