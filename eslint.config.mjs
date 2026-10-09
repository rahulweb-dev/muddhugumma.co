import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Client components read browser-only state (localStorage bag/wishlist/compare, matchMedia) in an effect
      // after hydration so server and client HTML match. That deliberate pattern trips this rule; keep it visible as a warning.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Admin pages are server components rendered per request, so reading the current time during render is correct.
    files: ["src/app/admin/**/*.tsx"],
    rules: { "react-hooks/purity": "warn" },
  },
  {
    ignores: ["scripts/**"],
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
