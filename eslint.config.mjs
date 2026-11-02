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
    { name: "@prisma/client", message: BOUNDARY_MESSAGE, allowTypeImports: true },
    { name: "@prisma/adapter-pg", message: BOUNDARY_MESSAGE, allowTypeImports: true },
  ],
  patterns: [
    {
      // Matches the `@/` alias form and relative forms alike.
      group: ["**/generated/prisma", "**/generated/prisma/**"],
      message: BOUNDARY_MESSAGE,
      // `allowTypeImports` is why this uses the typescript-eslint version of
      // the rule rather than the core one. Domain types — `MembershipRole`,
      // `OpportunityStatus` — are erased at compile time and cannot touch the
      // database, so sharing them with components is safe and stops those
      // unions being hand-duplicated and drifting. A value import of the same
      // module is still blocked: Prisma's generated `enums.ts` exports a
      // runtime const alongside each type, and that is the line this draws.
      allowTypeImports: true,
    },
  ],
};

/**
 * Literal colours are banned in markup, and that is architecture too.
 *
 * The MVP is built deliberately theme-neutral: the palette arrives from the
 * business lead at the end and gets swapped once, before shipping. That is only
 * a one-file edit if every colour reference in the app goes through a role token
 * — `bg-background`, `text-foreground`, `bg-primary`, `text-destructive` — which
 * the theme redefines. A single `bg-blue-500` or `text-[#16c172]` is a colour
 * the swap silently misses, and finding them later means reading every
 * component.
 *
 * Scoped to `className` and `style` so ordinary strings are unaffected. See
 * docs/brand-brief.md for what is actually pending.
 */
const COLOUR_MESSAGE =
  "Use a semantic token (bg-background, text-foreground, bg-primary, text-destructive) or a brand- token, not a literal colour. The palette is swapped in one file at the end; a literal is a colour that swap will miss. See docs/brand-brief.md.";

const TAILWIND_PALETTE =
  "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const colourLiterals = [
  {
    // `bg-blue-500`, `hover:text-red-600`, `dark:border-zinc-800`. Plain
    // strings: a Literal node exposes `value`, so match on that.
    selector: `JSXAttribute[name.name=/^(className|style)$/] Literal[value=/(?:^|[\\s:'"\`])(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow)-(?:${TAILWIND_PALETTE})-[0-9]{2,3}/]`,
    message: COLOUR_MESSAGE,
  },
  {
    // The same inside a template literal, where the text lives on `value.raw`.
    selector: `JSXAttribute[name.name=/^(className|style)$/] TemplateElement[value.raw=/(?:^|[\\s:'"\`])(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow)-(?:${TAILWIND_PALETTE})-[0-9]{2,3}/]`,
    message: COLOUR_MESSAGE,
  },
  {
    // Arbitrary values: `bg-[#16c172]`, `text-[rgb(0,0,0)]`.
    selector: `JSXAttribute[name.name=/^(className|style)$/] Literal[value=/-\\[(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|lab|color)\\()/]`,
    message: COLOUR_MESSAGE,
  },
  {
    selector: `JSXAttribute[name.name=/^(className|style)$/] TemplateElement[value.raw=/-\\[(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|lab|color)\\()/]`,
    message: COLOUR_MESSAGE,
  },
];

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
      "@typescript-eslint/no-restricted-imports": ["error", prismaBoundary],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Markup, where the theme has to stay swappable.
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    ignores: [
      // shadcn generates these and the CLI overwrites them on update; they use
      // semantic tokens already, and hand-editing them to satisfy our rule
      // would be undone by the next `shadcn add`.
      "src/components/ui/**",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...colourLiterals],
    },
  },
  {
    // The only places allowed to reach the database.
    //
    // `src/test/integration/**` is here because the harness must construct its
    // own client against the throwaway test database. Test code never ships to
    // the browser, so this does not weaken the rule it is exempt from — but
    // service tests should still go through service functions rather than
    // reaching past them with the harness client.
    files: [
      "src/server/db.ts",
      "src/server/services/**/*.ts",
      "src/test/integration/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
    },
  },
  prettier,
);
