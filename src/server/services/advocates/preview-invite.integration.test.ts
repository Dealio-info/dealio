import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeBusiness, makeUser } from "@/test/integration/fixtures";
import { inviteAdvocate } from "./invite-advocate";
import { claimInvite } from "./claim-invite";
import { previewInvite } from "./preview-invite";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

async function invited(email = "dana@customer.com") {
  const business = await makeBusiness({ name: "Acme" });
  const rep: ServiceContext = {
    db: prisma,
    actor: { kind: "business", userId: "u-rep", businessId: business.id, role: "REP" },
  };
  const invite = await inviteAdvocate(rep, { email, name: "Dana" });
  return { business, invite };
}

describe("previewInvite", () => {
  it("reports an open invite with who sent it and to whom", async () => {
    const { invite } = await invited("Dana@Customer.com");

    await expect(previewInvite(prisma, { token: invite.token })).resolves.toEqual({
      state: "open",
      businessName: "Acme",
      email: "dana@customer.com",
    });
  });

  it("changes nothing — the same link still claims afterwards", async () => {
    const { invite } = await invited();
    const user = await makeUser();

    // Look at it repeatedly, as a mail scanner and a prefetching browser would.
    for (let i = 0; i < 3; i++) await previewInvite(prisma, { token: invite.token });

    const row = await prisma.advocateInvite.findFirstOrThrow({
      where: { advocateId: invite.advocateId },
    });
    expect(row.claimedAt).toBeNull();
    const advocate = await prisma.advocate.findUniqueOrThrow({
      where: { id: invite.advocateId },
    });
    expect(advocate.userId).toBeNull();
    expect(advocate.status).toBe("INVITED");

    await expect(
      claimInvite(prisma, { token: invite.token, userId: user.id }),
    ).resolves.toMatchObject({ alreadyClaimed: false });
  });

  it("returns null for a token that matches nothing", async () => {
    await invited();
    await expect(
      previewInvite(prisma, { token: "not-a-real-token" }),
    ).resolves.toBeNull();
  });

  it("says 'yours' to the person who claimed it, 'used' to anyone else", async () => {
    const { invite } = await invited();
    const [claimer, stranger] = await Promise.all([makeUser(), makeUser()]);
    await claimInvite(prisma, { token: invite.token, userId: claimer.id });

    await expect(
      previewInvite(prisma, { token: invite.token, userId: claimer.id }),
    ).resolves.toMatchObject({ state: "yours" });
    await expect(
      previewInvite(prisma, { token: invite.token, userId: stranger.id }),
    ).resolves.toMatchObject({ state: "used" });
    await expect(previewInvite(prisma, { token: invite.token })).resolves.toMatchObject(
      {
        state: "used",
      },
    );
  });

  it("reports an expired invite", async () => {
    const { invite } = await invited();
    await prisma.advocateInvite.updateMany({
      where: { advocateId: invite.advocateId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(previewInvite(prisma, { token: invite.token })).resolves.toMatchObject(
      {
        state: "expired",
      },
    );
  });

  it("reports a deactivated advocate", async () => {
    const { invite } = await invited();
    await prisma.advocate.update({
      where: { id: invite.advocateId },
      data: { status: "INACTIVE" },
    });

    await expect(previewInvite(prisma, { token: invite.token })).resolves.toMatchObject(
      {
        state: "deactivated",
      },
    );
  });

  it("agrees with claimInvite: what previews as open, claims", async () => {
    // And what previews as anything else, the claim refuses. Checked for each
    // non-open state so the two orderings cannot drift apart.
    const states: Array<[string, (advocateId: string) => Promise<unknown>]> = [
      [
        "expired",
        (id) =>
          prisma.advocateInvite.updateMany({
            where: { advocateId: id },
            data: { expiresAt: new Date(Date.now() - 1000) },
          }),
      ],
      [
        "deactivated",
        (id) => prisma.advocate.update({ where: { id }, data: { status: "INACTIVE" } }),
      ],
    ];
    for (const [expected, setUp] of states) {
      await resetDb();
      const { invite } = await invited();
      const user = await makeUser();
      await setUp(invite.advocateId);

      const preview = await previewInvite(prisma, { token: invite.token });
      expect(preview?.state).toBe(expected);
      await expect(
        claimInvite(prisma, { token: invite.token, userId: user.id }),
      ).rejects.toThrow();
    }
  });
});
