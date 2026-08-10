-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('DRAFT', 'SAVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PhotoSource" AS ENUM ('SOURCE_PAGE', 'WEB_SEARCH', 'UPLOAD', 'PLACEHOLDER');

-- CreateEnum
CREATE TYPE "MacroSource" AS ENUM ('USDA', 'CLAUDE', 'MANUAL');

-- CreateEnum
CREATE TYPE "AiKind" AS ENUM ('SUBSTITUTE', 'GENERATE', 'IMPORT', 'PHOTO', 'MACRO_MATCH');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "glyph" TEXT NOT NULL DEFAULT '*',

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "baseServings" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "servingLabel" TEXT NOT NULL DEFAULT 'serving',
    "prepMinutes" INTEGER,
    "cookMinutes" INTEGER,
    "sourceUrl" TEXT,
    "notes" TEXT,
    "status" "RecipeStatus" NOT NULL DEFAULT 'SAVED',
    "shareId" TEXT,
    "sharedAt" TIMESTAMP(3),
    "importedFrom" JSONB,
    "photoUrl" TEXT,
    "photoSource" "PhotoSource",
    "photoCredit" JSONB,
    "photoCandidates" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "rawText" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "name" TEXT NOT NULL,
    "prepNote" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "scalable" BOOLEAN NOT NULL DEFAULT true,
    "ingredientId" TEXT,
    "gramsOverride" DOUBLE PRECISION,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "usdaFdcId" TEXT,
    "kcal100g" DOUBLE PRECISION NOT NULL,
    "protein100g" DOUBLE PRECISION NOT NULL,
    "carbs100g" DOUBLE PRECISION NOT NULL,
    "fat100g" DOUBLE PRECISION NOT NULL,
    "fiber100g" DOUBLE PRECISION,
    "sugar100g" DOUBLE PRECISION,
    "sodiumMg100g" DOUBLE PRECISION,
    "densityGPerMl" DOUBLE PRECISION,
    "gramsPerUnit" DOUBLE PRECISION,
    "source" "MacroSource" NOT NULL DEFAULT 'USDA',
    "sourceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInteraction" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT,
    "kind" "AiKind" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "webSearchRequests" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RecipeToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RecipeToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_position_idx" ON "Category"("position");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_slug_key" ON "Recipe"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_shareId_key" ON "Recipe"("shareId");

-- CreateIndex
CREATE INDEX "Recipe_categoryId_status_idx" ON "Recipe"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Recipe_updatedAt_idx" ON "Recipe"("updatedAt");

-- CreateIndex
CREATE INDEX "RecipeIngredient_ingredientId_idx" ON "RecipeIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_position_key" ON "RecipeIngredient"("recipeId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Step_recipeId_position_key" ON "Step"("recipeId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_name_key" ON "Ingredient"("name");

-- CreateIndex
CREATE INDEX "Ingredient_usdaFdcId_idx" ON "Ingredient"("usdaFdcId");

-- CreateIndex
CREATE INDEX "AiInteraction_createdAt_idx" ON "AiInteraction"("createdAt");

-- CreateIndex
CREATE INDEX "_RecipeToTag_B_index" ON "_RecipeToTag"("B");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInteraction" ADD CONSTRAINT "AiInteraction_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RecipeToTag" ADD CONSTRAINT "_RecipeToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RecipeToTag" ADD CONSTRAINT "_RecipeToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-added indexes (not expressible in schema.prisma)
--
-- Prisma cannot declare expression indexes, so the full-text and trigram
-- indexes backing searchRecipes() and ingredient resolution are added here.
-- They are part of the initial migration rather than a later one so that a
-- fresh deployment is immediately searchable.
-- ---------------------------------------------------------------------------

-- Full-text search over recipe prose. The two-argument to_tsvector() form with
-- a literal regconfig is IMMUTABLE, which is what permits its use in an
-- expression index; the one-argument form depends on a session GUC and is not.
CREATE INDEX "Recipe_fts_idx" ON "Recipe" USING GIN (
    to_tsvector(
        'english',
        coalesce("title", '') || ' ' ||
        coalesce("description", '') || ' ' ||
        coalesce("notes", '')
    )
);

-- Full-text search over ingredient lines, so "anything with harissa in it"
-- resolves. rawText is included alongside name because the parsed name drops
-- qualifiers ("smoked paprika" -> "paprika") that are worth matching on.
CREATE INDEX "RecipeIngredient_fts_idx" ON "RecipeIngredient" USING GIN (
    to_tsvector('english', "name" || ' ' || "rawText")
);

-- Trigram index for fuzzy matching free-text ingredient names against the
-- canonical Ingredient library (nutrition resolution, step 1). Exact and
-- prefix matching alone miss the common cases -- plurals, British/American
-- spellings, and word order ("butter, unsalted" vs "unsalted butter").
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Ingredient_name_trgm_idx" ON "Ingredient" USING GIN ("name" gin_trgm_ops);
