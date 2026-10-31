import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The database-import boundary is the load-bearing piece of this
 * architecture: multi-tenant isolation is enforced in the service layer rather
 * than by row-level security, which is only sound because nothing outside that
 * layer can reach the database at all.
 *
 * That makes the lint rule a correctness guarantee, not a style preference —
 * so it gets a test. Until now it was verified by hand, which is exactly the
 * kind of check that quietly stops happening.
 *
 * `lintText` applies the real flat config for the given path without the file
 * needing to exist, so these are the actual project rules rather than a copy.
 */

const RULE = "@typescript-eslint/no-restricted-imports";

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint();
});

async function boundaryErrors(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === RULE)
    .map((m) => m.message);
}

describe("the browser never touches the database", () => {
  it.each([
    [
      "the generated client",
      `import { PrismaClient } from "@/generated/prisma/client";`,
    ],
    [
      "a relative path to the generated client",
      `import { PrismaClient } from "../generated/prisma/client";`,
    ],
    ["the @prisma/client package", `import { PrismaClient } from "@prisma/client";`],
    ["the pg driver adapter", `import { PrismaPg } from "@prisma/adapter-pg";`],
  ])("blocks a value import of %s from the app layer", async (_label, code) => {
    const errors = await boundaryErrors(code, "src/app/page.tsx");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/service function that takes a TenantContext/);
  });

  it("blocks it from a component too, not just a page", async () => {
    const errors = await boundaryErrors(
      `import { PrismaClient } from "@/generated/prisma/client";`,
      "src/components/advocate-table.tsx",
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("the allowlist", () => {
  it.each([
    ["src/server/db.ts"],
    ["src/server/services/tenancy/create-business.ts"],
    ["src/test/integration/harness.ts"],
  ])("permits a value import from %s", async (filePath) => {
    const errors = await boundaryErrors(
      `import { PrismaClient } from "@/generated/prisma/client";`,
      filePath,
    );
    expect(errors).toEqual([]);
  });
});

describe("type-only imports are permitted anywhere", () => {
  // Types are erased at compile time and cannot reach the database, so sharing
  // domain types with the UI is safe — and stops those unions being
  // hand-duplicated and drifting out of sync with the schema.
  it.each([
    [`import type { MembershipRole } from "@/generated/prisma/enums";`],
    [`import type { OpportunityStatus } from "@/generated/prisma/enums";`],
    [`import { type OpportunityStatus } from "@/generated/prisma/enums";`],
  ])("allows %s in a component", async (code) => {
    expect(await boundaryErrors(code, "src/components/status-badge.tsx")).toEqual([]);
  });

  it("still blocks the runtime const of the same module", async () => {
    // Prisma generates a runtime object alongside each enum type. Importing
    // that is a value import, and is where the line sits.
    const errors = await boundaryErrors(
      `import { MembershipRole } from "@/generated/prisma/enums";`,
      "src/components/status-badge.tsx",
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
