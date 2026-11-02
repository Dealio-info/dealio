import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type ServiceContext,
} from "@/server/context";
import {
  disconnectTestPrisma,
  resetDb,
  separateTestPrisma,
  testPrisma,
} from "@/test/integration/harness";
import { makeAdvocate, makeBusiness, makeUser } from "@/test/integration/fixtures";
import { createOpportunity } from "./create-opportunity";
import { transitionOpportunity } from "./transition-opportunity";
import { getOpportunity, listOpportunities } from "./list-opportunities";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

/** A business with an admin, a rep, and one advocate. */
async function scenario(opts: { delegated?: boolean } = {}) {
  const delegated = opts.delegated ?? false;
  const [business, admin, rep] = await Promise.all([
    makeBusiness({
      requireAdminApprovalForOpportunities: !delegated,
      requireAdminApprovalForRewards: !delegated,
    }),
    makeUser(),
    makeUser(),
  ]);
  const advocate = await makeAdvocate(business.id);

  const ctx = {
    admin: {
      db: prisma,
      actor: {
        kind: "business",
        userId: admin.id,
        businessId: business.id,
        role: "BUSINESS_ADMIN",
      },
    } satisfies ServiceContext,
    rep: {
      db: prisma,
      actor: { kind: "business", userId: rep.id, businessId: business.id, role: "REP" },
    } satisfies ServiceContext,
    advocate: {
      db: prisma,
      actor: {
        kind: "advocate",
        userId: (await makeUser()).id,
        businessId: business.id,
        advocateId: advocate.id,
      },
    } satisfies ServiceContext,
  };

  return { business, admin, rep, advocate, ctx };
}

async function draft(
  s: Awaited<ReturnType<typeof scenario>>,
  by: "admin" | "rep" = "rep",
) {
  return createOpportunity(s.ctx[by], {
    advocateId: s.advocate.id,
    type: "REFERENCE_CALL",
    title: "Reference call for Acme",
    rewardAmount: 5,
  });
}

describe("createOpportunity", () => {
  it("starts at PENDING_APPROVAL and opens the audit trail", async () => {
    const s = await scenario();
    const created = await draft(s);

    expect(created.status).toBe("PENDING_APPROVAL");
    const detail = await getOpportunity(s.ctx.admin, created.id);
    expect(detail.events).toEqual([
      expect.objectContaining({
        fromStatus: null,
        toStatus: "PENDING_APPROVAL",
        actorUserId: s.rep.id,
      }),
    ]);
  });

  it("refuses an advocate from another business", async () => {
    const s = await scenario();
    const elsewhere = await makeBusiness();
    const theirs = await makeAdvocate(elsewhere.id);

    await expect(
      createOpportunity(s.ctx.rep, {
        advocateId: theirs.id,
        type: "TESTIMONIAL",
        title: "x",
        rewardAmount: 1,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses a deactivated advocate", async () => {
    const s = await scenario();
    await prisma.advocate.update({
      where: { id: s.advocate.id },
      data: { status: "INACTIVE" },
    });

    await expect(draft(s)).rejects.toThrow(ConflictError);
  });

  it("refuses an advocate actor", async () => {
    const s = await scenario();
    await expect(
      createOpportunity(s.ctx.advocate, {
        advocateId: s.advocate.id,
        type: "TESTIMONIAL",
        title: "x",
        rewardAmount: 1,
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("the approval policy, read from the business row", () => {
  it("stops a rep publishing or verifying when the business requires sign-off", async () => {
    const s = await scenario({ delegated: false });
    const opp = await draft(s);

    await expect(
      transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REQUESTED" }),
    ).rejects.toThrow(ForbiddenError);

    // The admin publishes; the advocate does the work.
    await transitionOpportunity(s.ctx.admin, {
      opportunityId: opp.id,
      to: "REQUESTED",
    });
    await transitionOpportunity(s.ctx.advocate, {
      opportunityId: opp.id,
      to: "ACCEPTED",
    });
    await transitionOpportunity(s.ctx.advocate, {
      opportunityId: opp.id,
      to: "COMPLETED",
    });

    await expect(
      transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "VERIFIED" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lets the same rep carry it through once the business delegates", async () => {
    const s = await scenario({ delegated: true });
    const opp = await draft(s);

    await transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REQUESTED" });
    await transitionOpportunity(s.ctx.advocate, {
      opportunityId: opp.id,
      to: "ACCEPTED",
    });
    await transitionOpportunity(s.ctx.advocate, {
      opportunityId: opp.id,
      to: "COMPLETED",
    });
    await transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "VERIFIED" });
    await transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REWARDED" });

    const detail = await getOpportunity(s.ctx.admin, opp.id);
    expect(detail.status).toBe("REWARDED");
  });

  it("follows the business row when the policy changes mid-flight", async () => {
    const s = await scenario({ delegated: false });
    const opp = await draft(s);
    await expect(
      transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REQUESTED" }),
    ).rejects.toThrow(ForbiddenError);

    await prisma.business.update({
      where: { id: s.business.id },
      data: { requireAdminApprovalForOpportunities: false },
    });

    // Same rep, same opportunity, same call — the only change is the business
    // row, which is where authority is read from.
    await expect(
      transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REQUESTED" }),
    ).resolves.toMatchObject({ to: "REQUESTED" });
  });

  it("cannot be widened by anything in the input", async () => {
    const s = await scenario({ delegated: false });
    const opp = await draft(s);

    // There is no policy parameter to forge — the type has none. Passing one
    // anyway is inert, which is the property worth pinning down.
    await expect(
      transitionOpportunity(s.ctx.rep, {
        opportunityId: opp.id,
        to: "REQUESTED",
        ...({
          policy: {
            requireAdminApprovalForOpportunities: false,
            requireAdminApprovalForRewards: false,
          },
          requireAdminApprovalForOpportunities: false,
        } as object),
      }),
    ).rejects.toThrow(ForbiddenError);

    const after = await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } });
    expect(after.status).toBe("PENDING_APPROVAL");
  });

  it("changing the policy leaves existing history untouched", async () => {
    const s = await scenario({ delegated: false });
    const opp = await draft(s);
    await transitionOpportunity(s.ctx.admin, {
      opportunityId: opp.id,
      to: "REQUESTED",
    });
    const before = await prisma.opportunityEvent.findMany({
      where: { opportunityId: opp.id },
      orderBy: { createdAt: "asc" },
    });

    await prisma.business.update({
      where: { id: s.business.id },
      data: {
        requireAdminApprovalForOpportunities: true,
        requireAdminApprovalForRewards: false,
      },
    });

    const after = await prisma.opportunityEvent.findMany({
      where: { opportunityId: opp.id },
      orderBy: { createdAt: "asc" },
    });
    expect(after).toEqual(before);
  });
});

describe("transitionOpportunity", () => {
  it("writes an event for every step of the happy path", async () => {
    const s = await scenario({ delegated: true });
    const opp = await draft(s);

    await transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REQUESTED" });
    await transitionOpportunity(s.ctx.advocate, {
      opportunityId: opp.id,
      to: "ACCEPTED",
    });
    await transitionOpportunity(s.ctx.advocate, {
      opportunityId: opp.id,
      to: "COMPLETED",
    });
    await transitionOpportunity(s.ctx.rep, {
      opportunityId: opp.id,
      to: "VERIFIED",
      influencedRevenueCents: 1_234_500n,
      note: "Closed-won in March",
    });
    await transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REWARDED" });

    const detail = await getOpportunity(s.ctx.admin, opp.id);
    expect(detail.events.map((e) => [e.fromStatus, e.toStatus])).toEqual([
      [null, "PENDING_APPROVAL"],
      ["PENDING_APPROVAL", "REQUESTED"],
      ["REQUESTED", "ACCEPTED"],
      ["ACCEPTED", "COMPLETED"],
      ["COMPLETED", "VERIFIED"],
      ["VERIFIED", "REWARDED"],
    ]);
    expect(detail.influencedRevenueCents).toBe(1_234_500n);
    expect(detail.events.find((e) => e.toStatus === "VERIFIED")?.note).toBe(
      "Closed-won in March",
    );
  });

  it("stamps the timestamp belonging to each status", async () => {
    const s = await scenario({ delegated: true });
    const opp = await draft(s);
    await transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REQUESTED" });
    await transitionOpportunity(s.ctx.advocate, {
      opportunityId: opp.id,
      to: "ACCEPTED",
    });

    const row = await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } });
    expect(row.requestedAt).toBeInstanceOf(Date);
    expect(row.acceptedAt).toBeInstanceOf(Date);
    expect(row.completedAt).toBeNull();
    expect(row.closedAt).toBeNull();
  });

  it("refuses an illegal edge with a conflict, not a permission error", async () => {
    const s = await scenario({ delegated: true });
    const opp = await draft(s);

    // PENDING_APPROVAL → REWARDED is not an edge at all.
    await expect(
      transitionOpportunity(s.ctx.admin, { opportunityId: opp.id, to: "REWARDED" }),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses to record influenced revenue on any transition but verification", async () => {
    const s = await scenario({ delegated: true });
    const opp = await draft(s);

    await expect(
      transitionOpportunity(s.ctx.rep, {
        opportunityId: opp.id,
        to: "REQUESTED",
        influencedRevenueCents: 500n,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("will not let an advocate act on someone else's opportunity", async () => {
    const s = await scenario({ delegated: true });
    const opp = await draft(s);
    await transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REQUESTED" });

    const intruder = await makeAdvocate(s.business.id, { email: "other@customer.com" });
    const intruderCtx: ServiceContext = {
      db: prisma,
      actor: {
        kind: "advocate",
        userId: (await makeUser()).id,
        businessId: s.business.id,
        advocateId: intruder.id,
      },
    };

    // Not forbidden — absent. An advocate has no way to learn it exists.
    await expect(
      transitionOpportunity(intruderCtx, { opportunityId: opp.id, to: "ACCEPTED" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a cross-tenant transition under either policy", async () => {
    for (const delegated of [false, true]) {
      await resetDb();
      const s = await scenario({ delegated });
      const opp = await draft(s);

      const elsewhere = await makeBusiness();
      const outsider: ServiceContext = {
        db: prisma,
        actor: {
          kind: "business",
          userId: (await makeUser()).id,
          businessId: elsewhere.id,
          role: "BUSINESS_ADMIN",
        },
      };

      await expect(
        transitionOpportunity(outsider, { opportunityId: opp.id, to: "REQUESTED" }),
      ).rejects.toThrow(NotFoundError);
      const after = await prisma.opportunity.findUniqueOrThrow({
        where: { id: opp.id },
      });
      expect(after.status).toBe("PENDING_APPROVAL");
    }
  });

  it("lets an advocate decline after accepting", async () => {
    const s = await scenario({ delegated: true });
    const opp = await draft(s);
    await transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REQUESTED" });
    await transitionOpportunity(s.ctx.advocate, {
      opportunityId: opp.id,
      to: "ACCEPTED",
    });

    await expect(
      transitionOpportunity(s.ctx.advocate, { opportunityId: opp.id, to: "DECLINED" }),
    ).resolves.toMatchObject({ to: "DECLINED" });
    const row = await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } });
    expect(row.closedAt).toBeInstanceOf(Date);
  });

  it("treats REWARDED as terminal", async () => {
    const s = await scenario({ delegated: true });
    const opp = await draft(s);
    for (const [who, to] of [
      ["rep", "REQUESTED"],
      ["advocate", "ACCEPTED"],
      ["advocate", "COMPLETED"],
      ["rep", "VERIFIED"],
      ["rep", "REWARDED"],
    ] as const) {
      await transitionOpportunity(s.ctx[who], { opportunityId: opp.id, to });
    }

    for (const to of ["CANCELLED", "VERIFIED", "DECLINED"] as const) {
      await expect(
        transitionOpportunity(s.ctx.admin, { opportunityId: opp.id, to }),
      ).rejects.toThrow(ConflictError);
    }
  });

  it("refuses when the status moved between its own read and write", async () => {
    // Same technique as the claim-invite races: a second connection holds an
    // uncommitted status change, so this call reads the old status, passes
    // every check, and then blocks on the row lock. The compare-and-swap in
    // the `where` clause is the only thing that can still catch it.
    const s = await scenario({ delegated: true });
    const opp = await draft(s);
    const other = separateTestPrisma();
    await other.$queryRaw`SELECT 1`;

    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      const holding = other.$transaction(async (tx) => {
        await tx.opportunity.update({
          where: { id: opp.id },
          data: { status: "CANCELLED", closedAt: new Date() },
        });
        await gate;
      });
      await new Promise((r) => setTimeout(r, 150));

      const publishing = prisma.$transaction((tx) =>
        transitionOpportunity(
          { db: tx, actor: s.ctx.rep.actor },
          { opportunityId: opp.id, to: "REQUESTED" },
        ),
      );
      await new Promise((r) => setTimeout(r, 150));
      release();
      await holding;

      await expect(publishing).rejects.toThrow(ConflictError);
      const row = await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } });
      expect(row.status).toBe("CANCELLED");
    } finally {
      await other.$disconnect();
    }
  });
});

describe("listOpportunities and getOpportunity", () => {
  it("shows staff the whole business and an advocate only their own", async () => {
    const s = await scenario({ delegated: true });
    const mine = await draft(s);
    const otherAdvocate = await makeAdvocate(s.business.id, {
      email: "two@customer.com",
    });
    await createOpportunity(s.ctx.rep, {
      advocateId: otherAdvocate.id,
      type: "CASE_STUDY",
      title: "Theirs",
      rewardAmount: 3,
    });

    const staffView = await listOpportunities(s.ctx.admin);
    expect(staffView).toHaveLength(2);

    const advocateView = await listOpportunities(s.ctx.advocate);
    expect(advocateView.map((o) => o.id)).toEqual([mine.id]);
  });

  it("never shows another business's opportunities", async () => {
    const s = await scenario();
    await draft(s);
    const elsewhere = await makeBusiness();
    const outsider: ServiceContext = {
      db: prisma,
      actor: {
        kind: "business",
        userId: (await makeUser()).id,
        businessId: elsewhere.id,
        role: "BUSINESS_ADMIN",
      },
    };

    expect(await listOpportunities(outsider)).toEqual([]);
  });

  it("filters by status", async () => {
    const s = await scenario({ delegated: true });
    const published = await draft(s);
    await draft(s);
    await transitionOpportunity(s.ctx.rep, {
      opportunityId: published.id,
      to: "REQUESTED",
    });

    const requested = await listOpportunities(s.ctx.admin, { status: "REQUESTED" });
    expect(requested.map((o) => o.id)).toEqual([published.id]);
  });

  it("refuses to show one opportunity across a tenant boundary", async () => {
    const s = await scenario();
    const opp = await draft(s);
    const elsewhere = await makeBusiness();
    const outsider: ServiceContext = {
      db: prisma,
      actor: {
        kind: "business",
        userId: (await makeUser()).id,
        businessId: elsewhere.id,
        role: "BUSINESS_ADMIN",
      },
    };

    await expect(getOpportunity(outsider, opp.id)).rejects.toThrow(NotFoundError);
  });
});
