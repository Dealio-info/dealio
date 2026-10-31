import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

/**
 * The `no-restricted-imports` rule below is load-bearing architecture, not style.
 *
 * Dealio's multi-tenant isolation is enforced in the service layer rather than by
 * row-level security. That is only sound if nothing outside the service layer can
 * reach the database at all — so Prisma is importable from `src/server/db.ts` and
 * `src/server/services/**` and nowhere else. Components, pages, route handlers and
 * server actions must go through a service function that takes a TenantContext.
 *
 * The prototype's cross-tenant defects all came from the browser holding direct
 * database access. This rule is what makes that impossible here. Do not relax it
 * to unblock a feature; add a service function instead.
 *
 * Task 3 adds a fixture test asserting this rule actually fails a bad import.
 */
const BOUNDARY_MESSAGE =
  "Import the Prisma client only from src/server/db.ts or src/server/services/**. Everything else must call a service function that takes a TenantContext. See CLAUDE.md.";

/**
 * Prisma 7 generates into `src/generated/prisma`, so the boundary has to cover
 * that path as well as the `@prisma/client` package — via the `@/` alias, a
 * relative path, or the adapter.
 */
const prismaBoundary = {
  paths: [
    { name: "@prisma/client", message: BOUNDARY_MESSAGE },
    { name: "@prisma/adapter-pg", message: BOUNDARY_MESSAGE },
  ],
  patterns: [
    {
      // Matches the `@/` alias form and relative forms alike.
      group: ["**/generated/prisma", "**/generated/prisma/**"],
      message: BOUNDARY_MESSAGE,
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "src/generated/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // `@next/eslint-plugin-next` is used directly rather than via
  // `eslint-config-next`, which is still eslintrc-only and would need the
  // FlatCompat shim. This gives the same Next rules in native flat config.
  // In plugin v16 the flat configs moved from `flatConfig.*` to `configs.*`;
  // the `*-legacy` entries are the old eslintrc format and are not used here.
  next.configs["core-web-vitals"],
  // In react-hooks v7 the flat configs live under `configs.flat`; the
  // top-level `configs["recommended-latest"]` is still eslintrc format.
  reactHooks.configs.flat["recommended-latest"],
  {
    rules: {
      "no-restricted-imports": ["error", prismaBoundary],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The only two places allowed to reach the database.
    files: ["src/server/db.ts", "src/server/services/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  prettier,
);
