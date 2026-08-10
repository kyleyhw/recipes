import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Disables stylistic rules that would fight Prettier. Must stay last among
  // the shared configs so it can turn those rules off again.
  prettier,
  {
    rules: {
      // --- Global standards §4/§9 mapping ---
      // TypeScript's `strict` forbids *implicit* any but permits explicit `any`.
      // This is the machine-enforced half of the annotation standard; the rest
      // rests on discipline, exactly as documented for `ty` in the Python case.
      // Third-party boundaries narrow via zod immediately, so no exemption is
      // needed here.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Prefer `import type` so type-only imports are erased and cannot create
      // accidental runtime dependencies — relevant because server-only modules
      // (Anthropic client, Prisma) must never be pulled into a client bundle.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
