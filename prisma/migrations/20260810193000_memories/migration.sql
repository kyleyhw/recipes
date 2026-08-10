-- Adds the Memory table: standing owner preferences injected into every Claude
-- prompt, so a preference is stated once rather than retyped per request.
--
-- NOTE for future migrations. This SQL was produced with
--   prisma migrate diff --from-config-datasource --to-schema
-- whose output began with `DROP INDEX "Ingredient_name_trgm_idx"`. That drop was
-- removed by hand and must never be reinstated: the trigram index is created by
-- the initial migration and is invisible to Prisma, which therefore reads it as
-- an unexpected index and proposes deleting it. Ingredient resolution depends on
-- it. Check for this line in any future generated migration.

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Memory_position_idx" ON "Memory"("position");
