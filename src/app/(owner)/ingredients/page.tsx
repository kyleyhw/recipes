import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { features } from "@/lib/env";

/**
 * Canonical ingredient library.
 *
 * The library is shared across every recipe, which is the point: resolving
 * "unsalted butter" once makes every recipe using it accurate, and a correction
 * made here propagates everywhere rather than needing to be repeated.
 *
 * Editing an ingredient marks it MANUAL, and no automatic pass overwrites a
 * MANUAL row. An owner who has corrected a figure has more authority than any
 * database.
 */
export default async function IngredientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const ingredients = await db.ingredient.findMany({
    where: query ? { name: { contains: query, mode: "insensitive" } } : {},
    orderBy: { name: "asc" },
    take: 200,
    include: { _count: { select: { usedBy: true } } },
  });

  async function save(formData: FormData): Promise<void> {
    "use server";
    const id = String(formData.get("id") ?? "");
    const num = (key: string): number | null => {
      const raw = String(formData.get(key) ?? "").trim();
      if (raw.length === 0) return null;
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };

    await db.ingredient.update({
      where: { id },
      data: {
        kcal100g: num("kcal100g") ?? 0,
        protein100g: num("protein100g") ?? 0,
        carbs100g: num("carbs100g") ?? 0,
        fat100g: num("fat100g") ?? 0,
        densityGPerMl: num("densityGPerMl"),
        gramsPerUnit: num("gramsPerUnit"),
        // The edit is the assertion of authority; recording it as MANUAL is what
        // protects it from a later automatic pass.
        source: "MANUAL",
        sourceNote: "Corrected by hand in the ingredient library",
      },
    });
    revalidatePath("/ingredients");
  }

  const cell =
    "w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent";

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Ingredients</h1>
      <p className="mt-1 text-sm text-text-muted">
        Nutrition per 100 g, shared by every recipe. Correcting a value here corrects it
        everywhere.{" "}
        {features.usda
          ? "New ingredients resolve against USDA FoodData Central."
          : "No USDA key is configured, so new ingredients must be added by hand."}
      </p>

      <form action="/ingredients" method="get" className="mt-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Filter by name"
          aria-label="Filter ingredients"
          className="flex-1 rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-card border border-border bg-surface-2 px-4 py-2 text-sm font-medium"
        >
          Filter
        </button>
      </form>

      <ul className="mt-6 flex flex-col gap-4">
        {ingredients.map((ingredient) => (
          <li
            key={ingredient.id}
            className="rounded-card border border-border bg-surface p-3"
          >
            <form action={save}>
              <input type="hidden" name="id" value={ingredient.id} />

              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-medium">{ingredient.name}</h2>
                <span className="text-xs text-text-muted">
                  {ingredient.source === "MANUAL"
                    ? "corrected by hand"
                    : ingredient.source}
                  {ingredient._count.usedBy > 0
                    ? ` · used in ${ingredient._count.usedBy} recipe${ingredient._count.usedBy === 1 ? "" : "s"}`
                    : ""}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["kcal100g", "kcal", ingredient.kcal100g],
                    ["protein100g", "Protein g", ingredient.protein100g],
                    ["carbs100g", "Carbs g", ingredient.carbs100g],
                    ["fat100g", "Fat g", ingredient.fat100g],
                  ] as const
                ).map(([name, label, value]) => (
                  <label
                    key={name}
                    className="flex flex-col gap-1 text-xs text-text-muted"
                  >
                    {label}
                    <input
                      name={name}
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={value}
                      className={`numeric ${cell}`}
                    />
                  </label>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Density g/ml (ρ — for cups and spoons)
                  <input
                    name="densityGPerMl"
                    type="number"
                    step="0.001"
                    min="0"
                    defaultValue={ingredient.densityGPerMl ?? ""}
                    className={`numeric ${cell}`}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Grams each (μ — for counts)
                  <input
                    name="gramsPerUnit"
                    type="number"
                    step="0.1"
                    min="0"
                    defaultValue={ingredient.gramsPerUnit ?? ""}
                    className={`numeric ${cell}`}
                  />
                </label>
              </div>

              {ingredient.sourceNote ? (
                <p className="mt-2 text-xs text-text-muted">{ingredient.sourceNote}</p>
              ) : null}

              <button type="submit" className="mt-2 text-xs text-accent hover:underline">
                Save
              </button>
            </form>
          </li>
        ))}
      </ul>

      {ingredients.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          {query ? "Nothing matches that filter." : "The library is empty."}
        </p>
      ) : null}
    </div>
  );
}
