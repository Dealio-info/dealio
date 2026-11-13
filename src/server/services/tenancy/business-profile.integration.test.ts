import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeAdvocate, makeBusiness } from "@/test/integration/fixtures";
import { getBusinessProfile } from "./business-profile";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

describe("getBusinessProfile", () => {
  it("returns the caller's own business to staff and advocates", async () => {
    const [mine] = await Promise.all([
      makeBusiness({ name: "Acme" }),
      makeBusiness({ name: "Globex" }),
    ]);
    const advocate = await makeAdvocate(mine.id);

    await expect(
      getBusinessProfile({
        db: prisma,
        actor: { kind: "business", userId: "u", businessId: mine.id, role: "REP" },
      }),
    ).resolves.toEqual({ id: mine.id, name: "Acme" });
    await expect(
      getBusinessProfile({
        db: prisma,
        actor: {
          kind: "advocate",
          userId: "u",
          businessId: mine.id,
          advocateId: advocate.id,
        },
      }),
    ).resolves.toEqual({ id: mine.id, name: "Acme" });
  });
});
