-- Adds the per-recipe log and revision history.
--
-- A recipe is not finished when it is written: it is cooked, found wanting, and
-- adjusted. `RecipeEntry` records the reason (a note, a message to Claude, its
-- reply) and `RecipeRevision` records the result as a complete snapshot, so any
-- version can be restored on its own without replaying a chain of diffs.
--
-- NOTE for future migrations. This SQL was produced with
--   prisma migrate diff --from-config-datasource --to-schema
-- whose output AGAIN began with `DROP INDEX "Ingredient_name_trgm_idx"` — the
-- second time this has happened, and the reason the memories migration carries
-- the same warning. The drop was removed by hand and must never be reinstated:
-- the trigram index is created by the initial migration, is invisible to
-- Prisma, and ingredient resolution depends on it. Check for this line in
-- every future generated migration.
--
-- `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block in
-- PostgreSQL before 12; the supported versions here are well past that, so the
-- statement stands as generated.

-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('NOTE', 'MESSAGE', 'REPLY');

-- CreateEnum
CREATE TYPE "RevisionSource" AS ENUM ('INITIAL', 'CHAT', 'EDIT', 'RESTORE');

-- AlterEnum
ALTER TYPE "AiKind" ADD VALUE 'REVISE';

-- CreateTable
CREATE TABLE "RecipeEntry" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "kind" "EntryKind" NOT NULL,
    "text" TEXT NOT NULL,
    "revisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeRevision" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "source" "RevisionSource" NOT NULL,
    "summary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeEntry_revisionId_key" ON "RecipeEntry"("revisionId");

-- CreateIndex
CREATE INDEX "RecipeEntry_recipeId_createdAt_idx" ON "RecipeEntry"("recipeId", "createdAt");

-- CreateIndex
CREATE INDEX "RecipeRevision_recipeId_createdAt_idx" ON "RecipeRevision"("recipeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeRevision_recipeId_number_key" ON "RecipeRevision"("recipeId", "number");

-- AddForeignKey
ALTER TABLE "RecipeEntry" ADD CONSTRAINT "RecipeEntry_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeEntry" ADD CONSTRAINT "RecipeEntry_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "RecipeRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeRevision" ADD CONSTRAINT "RecipeRevision_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

