import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import { BUILT_IN_MEMORIES } from "../src/lib/memories-data";

if (existsSync(".env")) process.loadEnvFile(".env");

/**
 * Seeds the category list.
 *
 * Categories are a table rather than an enum so they can be edited without a
 * migration; these are the starting set, chosen to cover the shapes of dish a
 * general collection contains. `position` is explicit so that meal-shaped
 * categories precede component ones, which alphabetical order would interleave.
 *
 * The seed is idempotent (upsert by slug), so it is safe to re-run against a
 * populated database — for instance after adding a category to this list.
 */
const CATEGORIES: ReadonlyArray<{ name: string; slug: string; glyph: string }> = [
  { name: "Mains", slug: "mains", glyph: "M" },
  { name: "Sides", slug: "sides", glyph: "S" },
  { name: "Breakfast", slug: "breakfast", glyph: "B" },
  { name: "Soups & Stews", slug: "soups-and-stews", glyph: "U" },
  { name: "Baked Goods", slug: "baked-goods", glyph: "K" },
  { name: "Desserts", slug: "desserts", glyph: "D" },
  { name: "Sauces & Condiments", slug: "sauces-and-condiments", glyph: "C" },
  { name: "Snacks", slug: "snacks", glyph: "N" },
  { name: "Drinks", slug: "drinks", glyph: "R" },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set; cannot seed.");
  }

  const adapter = new PrismaPg({ connectionString });
  const db = new PrismaClient({ adapter });

  try {
    for (const [index, category] of CATEGORIES.entries()) {
      await db.category.upsert({
        where: { slug: category.slug },
        // Name and glyph are refreshed, but position is only set on create so
        // that a manual reordering in the app is not undone by re-seeding.
        update: { name: category.name, glyph: category.glyph },
        create: { ...category, position: index },
      });
    }
    // Built-in memories are upserted by position so that re-seeding refreshes
    // their wording without duplicating them or discarding the owner's edits to
    // any memory they have since added.
    for (const memory of BUILT_IN_MEMORIES) {
      const existing = await db.memory.findFirst({
        where: { builtIn: true, position: memory.position },
        select: { id: true },
      });
      if (existing) continue;
      await db.memory.create({ data: { ...memory, builtIn: true } });
    }

    console.log(
      `Seeded ${CATEGORIES.length} categories and ensured ${BUILT_IN_MEMORIES.length} built-in memories.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
