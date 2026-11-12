import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  advocateActor,
  type ServiceContext,
} from "@/server/context";
import {
  disconnectTestPrisma,
  resetDb,
  separateTestPrisma,
  testPrisma,
} from "@/test/integration/harness";
import { makeBusiness, makeUser } from "@/test/integration/fixtures";
import { inviteAdvocate } from "./invite-advocate";
import { claimInvite } from "./claim-invite";
import { listAdvocates } from "./list-advocates";
import { hashInviteToken } from "./invite-token";
import { getAdvocateDashboard } from "./advocate-dashboard";
import { createOpportunity } from "@/server/services/opportunities/create-opportunity";
import { transitionOpportunity } from "@/server/services/opportunities/transition-opportunity";
import { listOpportunities } from "@/server/services/opportunities/list-opportunities";
import { resolveIdentity } from "@/server/services/identity/resolve-identity";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

function repOf(businessId: string, userId = "u-rep"): ServiceContext {
  return { db: prisma, actor: { kind: "business", userId, businessId, role: "REP" } };
}
function adminOf(businessId: string, userId = "u-admin"): ServiceContext {
  return {
    db: prisma,
    actor: { kind: "business", userId, businessId, role: "BUSINESS_ADMIN" },
  };
}
function advocateOf(
  businessId: string,
  userId: string,
  advocateId: string,
): ServiceContext {
  return { db: prisma, actor: { kind: "advocate", userId, businessId, advocateId } };
}

describe("inviteAdvocate", () => {
  it("creates an unclaimed advocate and a hashed invite", async () => {
    const business = await makeBusiness();

    const invite = await inviteAdvocate(repOf(business.id), {
      email: "ceo@customer.com",
      name: "Casey",
      company: "Customer Inc",
      title: "CEO",
    });

    const advocate = await prisma.advocate.findUniqueOrThrow({
      where: { id: invite.advocateId },
    });
    expect(advocate).toMatchObject({
      email: "ceo@customer.com",
      name: "Casey",
      status: "INVITED",
      userId: null,
    });

    // The plaintext token is never stored.
    const rows = await prisma.advocateInvite.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashInviteToken(invite.token));
    expect(rows[0]?.tokenHash).not.toBe(invite.token);
  });

  it("normalises the email so one person cannot be invited twice by spelling", async () => {
    const business = await makeBusiness();

    const first = await inviteAdvocate(repOf(business.id), {
      email: "  CEO@Customer.com ",
    });
    const second = await inviteAdvocate(repOf(business.id), {
      email: "ceo@customer.com",
    });

    expect(second.advocateId).toBe(first.advocateId);
    expect(second.reinvited).toBe(true);
    expect(await prisma.advocate.count()).toBe(1);
  });

  it("is open to a rep as well as an admin", async () => {
    const business = await makeBusiness();
    await expect(
      inviteAdvocate(repOf(business.id), { email: "a@customer.com" }),
    ).resolves.toBeTruthy();
    await expect(
      inviteAdvocate(adminOf(business.id), { email: "b@customer.com" }),
    ).resolves.toBeTruthy();
  });

  it("refuses an advocate actor, who must not recruit on the business's behalf", async () => {
    const business = await makeBusiness();
    const invite = await inviteAdvocate(repOf(business.id), {
      email: "a@customer.com",
    });
    const user = await makeUser();

    await expect(
      inviteAdvocate(advocateOf(business.id, user.id, invite.advocateId), {
        email: "b@customer.com",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("re-inviting expires the previous link so only the newest works", async () => {
    const business = await makeBusiness();
    const first = await inviteAdvocate(repOf(business.id), { email: "a@customer.com" });
    const second = await inviteAdvocate(repOf(business.id), {
      email: "a@customer.com",
    });
    const user = await makeUser();

    await expect(
      claimInvite(prisma, { token: first.token, userId: user.id }),
    ).rejects.toThrow(/expired/);
    await expect(
      claimInvite(prisma, { token: second.token, userId: user.id }),
    ).resolves.toMatchObject({ alreadyClaimed: false });
  });

  it("refuses to re-invite someone who already claimed", async () => {
    const business = await makeBusiness();
    const invite = await inviteAdvocate(repOf(business.id), {
      email: "a@customer.com",
    });
    const user = await makeUser();
    await claimInvite(prisma, { token: invite.token, userId: user.id });

    await expect(
      inviteAdvocate(repOf(business.id), { email: "a@customer.com" }),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses to re-invite a deactivated advocate, rather than silently restoring them", async () => {
    const business = await makeBusiness();
    const invite = await inviteAdvocate(repOf(business.id), {
      email: "a@customer.com",
    });
    await prisma.advocate.update({
      where: { id: invite.advocateId },
      data: { status: "INACTIVE" },
    });

    await expect(
      inviteAdvocate(repOf(business.id), { email: "a@customer.com" }),
    ).rejects.toThrow(/Reactivate/);
  });

  it("lets the same person advocate for two businesses independently", async () => {
    const [one, two] = await Promise.all([makeBusiness(), makeBusiness()]);

    const a = await inviteAdvocate(repOf(one.id), { email: "shared@customer.com" });
    const b = await inviteAdvocate(repOf(two.id), { email: "shared@customer.com" });

    expect(a.advocateId).not.toBe(b.advocateId);

    // And one person can claim both, holding two separate advocate records.
    const user = await makeUser();
    await claimInvite(prisma, { token: a.token, userId: user.id });
    await claimInvite(prisma, { token: b.token, userId: user.id });

    const records = await prisma.advocate.findMany({ where: { userId: user.id } });
    expect(records).toHaveLength(2);
    expect(new Set(records.map((r) => r.businessId))).toEqual(
      new Set([one.id, two.id]),
    );
  });
});

describe("claimInvite", () => {
  async function invited(email = "a@customer.com") {
    const business = await makeBusiness();
    const invite = await inviteAdvocate(repOf(business.id), { email });
    const user = await makeUser();
    return { business, invite, user };
  }

  it("links the user and activates the record", async () => {
    const { business, invite, user } = await invited();

    const result = await claimInvite(prisma, { token: invite.token, userId: user.id });

    expect(result).toEqual({
      advocateId: invite.advocateId,
      businessId: business.id,
      alreadyClaimed: false,
    });
    const advocate = await prisma.advocate.findUniqueOrThrow({
      where: { id: invite.advocateId },
    });
    expect(advocate).toMatchObject({ userId: user.id, status: "ACTIVE" });
  });

  it("burns the token, so the link cannot be reused by someone else", async () => {
    const { invite, user } = await invited();
    const other = await makeUser();
    await claimInvite(prisma, { token: invite.token, userId: user.id });

    await expect(
      claimInvite(prisma, { token: invite.token, userId: other.id }),
    ).rejects.toThrow(ConflictError);

    const advocate = await prisma.advocate.findUniqueOrThrow({
      where: { id: invite.advocateId },
    });
    expect(advocate.userId).toBe(user.id);
  });

  it("is idempotent for the same user, so a double-click is not an error", async () => {
    const { invite, user } = await invited();
    await claimInvite(prisma, { token: invite.token, userId: user.id });

    const again = await claimInvite(prisma, { token: invite.token, userId: user.id });

    expect(again.alreadyClaimed).toBe(true);
    expect(again.advocateId).toBe(invite.advocateId);
  });

  it("refuses a token that was never issued", async () => {
    const user = await makeUser();
    await expect(
      claimInvite(prisma, { token: "not-a-real-token", userId: user.id }),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses an expired token", async () => {
    const { invite, user } = await invited();
    await prisma.advocateInvite.updateMany({
      where: { advocateId: invite.advocateId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      claimInvite(prisma, { token: invite.token, userId: user.id }),
    ).rejects.toThrow(/expired/);
  });

  it("refuses when the advocate record was deactivated before claiming", async () => {
    const { invite, user } = await invited();
    await prisma.advocate.update({
      where: { id: invite.advocateId },
      data: { status: "INACTIVE" },
    });

    await expect(
      claimInvite(prisma, { token: invite.token, userId: user.id }),
    ).rejects.toThrow(/deactivated/);
  });

  it("never moves an advocate to another business", async () => {
    const { business, invite, user } = await invited();
    const elsewhere = await makeBusiness();

    await claimInvite(prisma, { token: invite.token, userId: user.id });

    const advocate = await prisma.advocate.findUniqueOrThrow({
      where: { id: invite.advocateId },
    });
    expect(advocate.businessId).toBe(business.id);
    expect(advocate.businessId).not.toBe(elsewhere.id);
  });

  it("grants a usable identity, and only for the inviting business", async () => {
    const { business, invite, user } = await invited();
    const elsewhere = await makeBusiness();
    await claimInvite(prisma, { token: invite.token, userId: user.id });

    // What resolveIdentity will see on their next sign-in.
    const profiles = await prisma.advocate.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { businessId: true },
    });
    expect(profiles).toEqual([{ businessId: business.id }]);
    expect(profiles.map((p) => p.businessId)).not.toContain(elsewhere.id);
  });

  it("rejects a second claim by a different user", async () => {
    const { invite } = await invited();
    const [first, second] = await Promise.all([makeUser(), makeUser()]);

    await claimInvite(prisma, { token: invite.token, userId: first.id });
    await expect(
      claimInvite(prisma, { token: invite.token, userId: second.id }),
    ).rejects.toThrow(ConflictError);

    const advocate = await prisma.advocate.findUniqueOrThrow({
      where: { id: invite.advocateId },
    });
    expect(advocate.userId).toBe(first.id);
  });

  it("refuses when the token is burned between its own read and write", async () => {
    // The interleaving that a read-then-write would get wrong: this claim
    // reads an unclaimed invite, and only *then* does someone else claim it.
    //
    // Forced rather than hoped for. Firing two claims at once does not produce
    // it — whichever reads second sees the committed result and stops at the
    // pre-check, so such a test passes even with no concurrency protection at
    // all, which an earlier version of this suite did. Here a second
    // connection holds an uncommitted write on the invite row, so this claim
    // reads the old value and then blocks on the lock; when the lock lifts, the
    // conditional update in `claimInvite` is what has to notice.
    const { invite, user } = await invited();
    const other = separateTestPrisma();
    await other.$queryRaw`SELECT 1`;

    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      const holding = other.$transaction(async (tx) => {
        await tx.advocateInvite.updateMany({
          where: { advocateId: invite.advocateId },
          data: { claimedAt: new Date() },
        });
        await gate;
      });
      await new Promise((r) => setTimeout(r, 150));

      const claiming = prisma.$transaction((tx) =>
        claimInvite(tx, { token: invite.token, userId: user.id }),
      );
      await new Promise((r) => setTimeout(r, 150));
      release();
      await holding;

      await expect(claiming).rejects.toThrow(ConflictError);
      const advocate = await prisma.advocate.findUniqueOrThrow({
        where: { id: invite.advocateId },
      });
      expect(advocate.userId).toBeNull();
    } finally {
      await other.$disconnect();
    }
  });

  it("refuses when the advocate is linked between its own read and write", async () => {
    // The same interleaving one row over. Reachable because two concurrent
    // `inviteAdvocate` calls can each leave a live token — the expiry of
    // earlier invites runs before the new one is created — so two valid tokens
    // for one advocate can be claimed at once. The invite compare-and-swap
    // does not help there: each claim burns a different invite row.
    const { invite, user } = await invited();
    const other = separateTestPrisma();
    const thief = await makeUser();
    await other.$queryRaw`SELECT 1`;

    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      const holding = other.$transaction(async (tx) => {
        await tx.advocate.updateMany({
          where: { id: invite.advocateId },
          data: { userId: thief.id, status: "ACTIVE" },
        });
        await gate;
      });
      await new Promise((r) => setTimeout(r, 150));

      const claiming = prisma.$transaction((tx) =>
        claimInvite(tx, { token: invite.token, userId: user.id }),
      );
      await new Promise((r) => setTimeout(r, 150));
      release();
      await holding;

      await expect(claiming).rejects.toThrow(ConflictError);
      const advocate = await prisma.advocate.findUniqueOrThrow({
        where: { id: invite.advocateId },
      });
      expect(advocate.userId).toBe(thief.id);
    } finally {
      await other.$disconnect();
    }
  });

  it("lets exactly one of two genuinely concurrent claims win", async () => {
    // Two clients, so two connection pools, so two transactions that really do
    // overlap. Both on one client does NOT work: they get serialised, and an
    // earlier version of this test stayed green after both compare-and-swaps
    // in `claimInvite` had been replaced with plain writes.
    const { invite } = await invited();
    const [first, second] = await Promise.all([makeUser(), makeUser()]);
    const other = separateTestPrisma();
    // Connect before the race. A cold client's handshake takes longer than the
    // whole first transaction, so without this the second one starts after the
    // first has already committed and nothing overlaps.
    await other.$queryRaw`SELECT 1`;

    try {
      const results = await Promise.allSettled([
        prisma.$transaction((tx) =>
          claimInvite(tx, { token: invite.token, userId: first.id }),
        ),
        other.$transaction((tx) =>
          claimInvite(tx, { token: invite.token, userId: second.id }),
        ),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const advocate = await prisma.advocate.findUniqueOrThrow({
        where: { id: invite.advocateId },
      });
      expect([first.id, second.id]).toContain(advocate.userId);
      expect(
        await prisma.advocateInvite.count({ where: { claimedAt: { not: null } } }),
      ).toBe(1);
    } finally {
      await other.$disconnect();
    }
  });
});

describe("listAdvocates", () => {
  it("returns only the caller's business's advocates", async () => {
    const [mine, theirs] = await Promise.all([makeBusiness(), makeBusiness()]);
    await inviteAdvocate(repOf(mine.id), { email: "mine@customer.com" });
    await inviteAdvocate(repOf(theirs.id), { email: "theirs@customer.com" });

    const list = await listAdvocates(repOf(mine.id));

    expect(list.map((a) => a.email)).toEqual(["mine@customer.com"]);
  });

  it("reports whether each invite has been claimed", async () => {
    const business = await makeBusiness();
    const claimed = await inviteAdvocate(repOf(business.id), {
      email: "in@customer.com",
    });
    await inviteAdvocate(repOf(business.id), { email: "out@customer.com" });
    const user = await makeUser();
    await claimInvite(prisma, { token: claimed.token, userId: user.id });

    const list = await listAdvocates(repOf(business.id));
    const byEmail = new Map(list.map((a) => [a.email, a]));

    expect(byEmail.get("in@customer.com")).toMatchObject({
      hasClaimed: true,
      status: "ACTIVE",
    });
    expect(byEmail.get("out@customer.com")).toMatchObject({
      hasClaimed: false,
      status: "INVITED",
    });
  });

  it("never leaks a user id or a token", async () => {
    const business = await makeBusiness();
    await inviteAdvocate(repOf(business.id), { email: "a@customer.com" });

    const [advocate] = await listAdvocates(repOf(business.id));

    expect(advocate).toBeDefined();
    expect(Object.keys(advocate!)).not.toContain("userId");
    expect(JSON.stringify(advocate)).not.toMatch(/token/i);
  });

  it("filters by status", async () => {
    const business = await makeBusiness();
    const claimed = await inviteAdvocate(repOf(business.id), {
      email: "in@customer.com",
    });
    await inviteAdvocate(repOf(business.id), { email: "out@customer.com" });
    const user = await makeUser();
    await claimInvite(prisma, { token: claimed.token, userId: user.id });

    const active = await listAdvocates(repOf(business.id), { status: "ACTIVE" });
    expect(active.map((a) => a.email)).toEqual(["in@customer.com"]);
  });

  it("refuses an advocate, who must not enumerate the other advocates", async () => {
    const business = await makeBusiness();
    const invite = await inviteAdvocate(repOf(business.id), {
      email: "a@customer.com",
    });
    const user = await makeUser();
    await claimInvite(prisma, { token: invite.token, userId: user.id });

    await expect(
      listAdvocates(advocateOf(business.id, user.id, invite.advocateId)),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("getAdvocateDashboard", () => {
  it("returns the business, the balance and only this advocate's work", async () => {
    const business = await makeBusiness({
      name: "Acme Corp",
      requireAdminApprovalForOpportunities: false,
      requireAdminApprovalForRewards: false,
    });
    // A real user row: `createOpportunity` records who created it.
    const repUser = await makeUser();
    const staff = repOf(business.id, repUser.id);
    const invite = await inviteAdvocate(staff, { email: "mine@customer.com" });
    const user = await makeUser();
    await claimInvite(prisma, { token: invite.token, userId: user.id });

    // A second advocate with their own opportunity, which must not appear.
    const otherInvite = await inviteAdvocate(staff, { email: "other@customer.com" });
    const otherUser = await makeUser();
    await claimInvite(prisma, { token: otherInvite.token, userId: otherUser.id });

    const mine = await createOpportunity(staff, {
      advocateId: invite.advocateId,
      type: "REFERENCE_CALL",
      title: "Mine",
      rewardAmount: 5,
    });
    await createOpportunity(staff, {
      advocateId: otherInvite.advocateId,
      type: "TESTIMONIAL",
      title: "Theirs",
      rewardAmount: 9,
    });
    for (const to of [
      "REQUESTED",
      "ACCEPTED",
      "COMPLETED",
      "VERIFIED",
      "REWARDED",
    ] as const) {
      const who =
        to === "ACCEPTED" || to === "COMPLETED"
          ? advocateOf(business.id, user.id, invite.advocateId)
          : staff;
      await transitionOpportunity(who, { opportunityId: mine.id, to });
    }

    const dash = await getAdvocateDashboard(
      advocateOf(business.id, user.id, invite.advocateId),
    );

    expect(dash.businessName).toBe("Acme Corp");
    expect(dash.balance).toBe(5);
    expect(dash.opportunities.map((o) => o.title)).toEqual(["Mine"]);
  });

  it("refuses a business actor — this is the advocate's own view", async () => {
    const business = await makeBusiness();
    await expect(getAdvocateDashboard(repOf(business.id))).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("the path an advocate's server action takes", () => {
  /**
   * The action resolves a session to an `Identity`, then names a business with
   * `advocateActor` and hands the result to the same state machine the
   * business side uses. `businessId` arrives from the form, which is only safe
   * because it is checked against the identity rather than trusted — so that
   * is what these cover, end to end from a claimed invite.
   */
  async function claimedAdvocate(businessName: string) {
    const business = await makeBusiness({
      name: businessName,
      requireAdminApprovalForOpportunities: false,
      requireAdminApprovalForRewards: false,
    });
    const repUser = await makeUser();
    const staff = repOf(business.id, repUser.id);
    const invite = await inviteAdvocate(staff, {
      email: `advocate-${businessName}@customer.com`,
    });
    const user = await makeUser();
    await claimInvite(prisma, { token: invite.token, userId: user.id });
    return { business, staff, user, advocateId: invite.advocateId };
  }

  it("carries an advocate from invite to completed work", async () => {
    const { business, staff, user, advocateId } = await claimedAdvocate("Acme");
    const opp = await createOpportunity(staff, {
      advocateId,
      type: "REFERENCE_CALL",
      title: "Call with a prospect",
      rewardAmount: 5,
    });
    await transitionOpportunity(staff, { opportunityId: opp.id, to: "REQUESTED" });

    const identity = await resolveIdentity(prisma, user.supabaseUserId);
    const actor = advocateActor(identity, business.id);

    await transitionOpportunity(
      { db: prisma, actor },
      { opportunityId: opp.id, to: "ACCEPTED" },
    );
    await transitionOpportunity(
      { db: prisma, actor },
      { opportunityId: opp.id, to: "COMPLETED" },
    );

    // What the rep then sees.
    const seen = await listOpportunities(staff);
    expect(seen[0]).toMatchObject({ id: opp.id, status: "COMPLETED" });
  });

  it("refuses a businessId the signed-in person is not an advocate of", async () => {
    const mine = await claimedAdvocate("Mine");
    const theirs = await claimedAdvocate("Theirs");
    const identity = await resolveIdentity(prisma, mine.user.supabaseUserId);

    // Exactly what a tampered form field would do.
    expect(() => advocateActor(identity, theirs.business.id)).toThrow(ForbiddenError);
  });

  it("gives an unclaimed invite no context at all", async () => {
    const business = await makeBusiness();
    const repUser = await makeUser();
    await inviteAdvocate(repOf(business.id, repUser.id), {
      email: "pending@customer.com",
    });
    // Someone who signed up but never claimed.
    const stranger = await makeUser({ email: "pending@customer.com" });

    const identity = await resolveIdentity(prisma, stranger.supabaseUserId);

    expect(identity.advocates).toEqual([]);
    expect(() => advocateActor(identity, business.id)).toThrow(ForbiddenError);
  });
});
