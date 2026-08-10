import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Test configuration.
 *
 * Only `tests/unit` is included. The modules under test there
 * (units, quantity, scaling, nutrition/compute, sharing/bundle) are pure
 * functions over plain data with no database or network access, which is what
 * makes them testable without fixtures, mocks, or a running Postgres — and is
 * also why they hold the application's mathematical content deliberately.
 */
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Reported in the markdown test reports under tests/reports/ as required
    // by the testing standard.
    reporters: ["verbose"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
