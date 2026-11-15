import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeAdvocate, makeBusiness } from "@/test/integration/fixtures";
import { getEmailPreference, setEmailOptOut } from "./unsubscribe";
import { listAdvocates } from "@/server/services/advocates/list-advocates";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

async function advocateAt(name: string, email = "dana@customer.com") {
  const business = await makeBusiness({ name });
  return makeAdvocate(business.id, { email });
}

describe("email preferences by token", () => {
  it("gives every new advocate a token from the database default", async () => {
    const a = await advocateAt("Acme");
    expect(a.emailUnsubscribeToken).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("unsubscribes and resubscribes one advocate at one business", async () => {
    const acme = await advocateAt("Acme");
    const globex = await advocateAt("Globex"); // the same person, elsewhere

    expect(await getEmailPreference(prisma, acme.emailUnsubscribeToken)).toEqual({
      businessName: "Acme",
      email: "dana@customer.com",
      optedOut: false,
    });

    await setEmailOptOut(prisma, acme.emailUnsubscribeToken, true);
    expect(
      (await getEmailPreference(prisma, acme.emailUnsubscribeToken))?.optedOut,
    ).toBe(true);
    // Unsubscribing from Acme says nothing about Globex.
    expect(
      (await getEmailPreference(prisma, globex.emailUnsubscribeToken))?.optedOut,
    ).toBe(false);

    await setEmailOptOut(prisma, acme.emailUnsubscribeToken, false);
    expect(
      (await getEmailPreference(prisma, acme.emailUnsubscribeToken))?.optedOut,
    ).toBe(false);
  });

  it("keeps the first unsubscribe date when asked twice", async () => {
    const a = await advocateAt("Acme");
    await setEmailOptOut(prisma, a.emailUnsubscribeToken, true);
    const first = (await prisma.advocate.findUniqueOrThrow({ where: { id: a.id } }))
      .emailOptedOutAt;
    await new Promise((r) => setTimeout(r, 10));
    await setEmailOptOut(prisma, a.emailUnsubscribeToken, true);
    const second = (await prisma.advocate.findUniqueOrThrow({ where: { id: a.id } }))
      .emailOptedOutAt;
    expect(second).toEqual(first);
  });

  it("returns null for a token that matches nothing or is not a token at all", async () => {
    await advocateAt("Acme");
    expect(
      await getEmailPreference(prisma, "00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
    expect(await getEmailPreference(prisma, "'; drop table advocates; --")).toBeNull();
    expect(await setEmailOptOut(prisma, "nope", true)).toBeNull();
  });

  it("is visible to the business, so an admin knows why nobody replies", async () => {
    const a = await advocateAt("Acme");
    const staff = {
      db: prisma,
      actor: { kind: "business", userId: "u", businessId: a.businessId, role: "REP" },
    } as const;
    expect((await listAdvocates(staff))[0]?.emailOptedOut).toBe(false);
    await setEmailOptOut(prisma, a.emailUnsubscribeToken, true);
    expect((await listAdvocates(staff))[0]?.emailOptedOut).toBe(true);
  });
});
