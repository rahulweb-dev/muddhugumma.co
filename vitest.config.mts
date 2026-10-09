import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": r("./src"),
      // "server-only" throws outside a React Server Components bundle; tests import server libs directly.
      "server-only": r("./tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx,mts}"],
    // Pin the clock-sensitive helpers (delivery windows, consult dates) to one timezone on every machine.
    env: { TZ: "UTC" },
  },
});
