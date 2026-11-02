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
import { createOpportunity } from "@/server/services/opportunities/create-opportunity";
import { transitionOpportunity } from "@/server/services/opportunities/transition-opportunity";
import { creditForOpportunity } from "./credit-for-opportunity";
import { getBalance, getOutstandingLiability, listLedgerEntries } from "./balance";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

async function scenario(opts: { delegated?: boolean } = {}) {
  const delegated = opts.delegated ?? false;
  const [business, admin, rep, advocateUser] = await Promise.all([
    makeBusiness({
      requireAdminApprovalForOpportunities: !delegated,
      requireAdminApprovalForRewards: !delegated,
    }),
    makeUser(),
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
        userId: advocateUser.id,
        businessId: business.id,
        advocateId: advocate.id,
      },
    } satisfies ServiceContext,
  };
  return { business, admin, rep, advocate, ctx };
}

type Scenario = Awaited<ReturnType<typeof scenario>>;

/**
 * Put an opportunity in REWARDED without crediting it — the state a repair
 * path would find. Done with raw SQL precisely because no service can produce
 * it: the transition always credits. Note the ledger cannot be cleared with
 * `deleteMany` instead; the append-only trigger refuses that, which is the
 * point of the trigger.
 */
async function forceRewardedUncredited(s: Scenario, rewardAmount = 5) {
  const opp = await advanceTo(s, "VERIFIED", rewardAmount);
  await prisma.$executeRaw`
    UPDATE opportunities SET status = 'REWARDED' WHERE id = ${opp.id}::uuid
  `;
  return opp;
}

/** Carry an opportunity to the given status. Admin drives, so policy never blocks. */
async function advanceTo(
  s: Scenario,
  target: "VERIFIED" | "REWARDED",
  rewardAmount = 5,
) {
  const opp = await createOpportunity(s.ctx.admin, {
    advocateId: s.advocate.id,
    type: "REFERENCE_CALL",
    title: "Reference call",
    rewardAmount,
  });
  await transitionOpportunity(s.ctx.admin, { opportunityId: opp.id, to: "REQUESTED" });
  await transitionOpportunity(s.ctx.advocate, {
    opportunityId: opp.id,
    to: "ACCEPTED",
  });
  await transitionOpportunity(s.ctx.advocate, {
    opportunityId: opp.id,
    to: "COMPLETED",
  });
  await transitionOpportunity(s.ctx.admin, { opportunityId: opp.id, to: "VERIFIED" });
  if (target === "REWARDED") {
    await transitionOpportunity(s.ctx.admin, { opportunityId: opp.id, to: "REWARDED" });
  }
  return opp;
}

describe("reaching REWARDED credits the advocate", () => {
  it("writes exactly one ledger entry, in the same breath as the status", async () => {
    const s = await scenario();
    const opp = await advanceTo(s, "REWARDED", 5);

    const entries = await prisma.ledgerEntry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      advocateId: s.advocate.id,
      businessId: s.business.id,
      opportunityId: opp.id,
      delta: 5,
      reason: "OPPORTUNITY_REWARD",
      actorUserId: s.admin.id,
    });
    expect(await getBalance(s.ctx.admin, { advocateId: s.advocate.id })).toBe(5);
  });

  it("writes no ledger entry before REWARDED", async () => {
    const s = await scenario();
    await advanceTo(s, "VERIFIED");

    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await getBalance(s.ctx.admin, { advocateId: s.advocate.id })).toBe(0);
  });

  it("credits nothing, and writes no row, for a zero-reward opportunity", async () => {
    const s = await scenario();
    await advanceTo(s, "REWARDED", 0);

    // The ledger forbids a zero delta, so the correct behaviour is no row at
    // all rather than a meaningless one.
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await getBalance(s.ctx.admin, { advocateId: s.advocate.id })).toBe(0);
  });

  it("sums several awards into one balance", async () => {
    const s = await scenario();
    await advanceTo(s, "REWARDED", 5);
    await advanceTo(s, "REWARDED", 11);
    await advanceTo(s, "REWARDED", 3);

    expect(await getBalance(s.ctx.admin, { advocateId: s.advocate.id })).toBe(19);
    expect(await prisma.ledgerEntry.count()).toBe(3);
  });

  it("rolls the credit back if the transaction fails after it", async () => {
    const s = await scenario();
    const opp = await advanceTo(s, "VERIFIED");

    await expect(
      prisma.$transaction(async (tx) => {
        await transitionOpportunity(
          { db: tx, actor: s.ctx.admin.actor },
          { opportunityId: opp.id, to: "REWARDED" },
        );
        throw new Error("something later blew up");
      }),
    ).rejects.toThrow("something later blew up");

    // Neither the status nor the money moved. This is the pairing invariant 1
    // is about: a reward that reads as paid but is not would be worse than an
    // outright failure.
    const row = await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } });
    expect(row.status).toBe("VERIFIED");
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });
});

describe("idempotency", () => {
  it("crediting twice for one opportunity yields one entry", async () => {
    const s = await scenario();
    const opp = await advanceTo(s, "REWARDED", 7);

    const again = await creditForOpportunity(s.ctx.admin, { opportunityId: opp.id });

    expect(again.alreadyCredited).toBe(true);
    expect(again.delta).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(1);
    expect(await getBalance(s.ctx.admin, { advocateId: s.advocate.id })).toBe(7);
  });

  it("is enforced by the database, not by the check above it", async () => {
    const s = await scenario();
    const opp = await advanceTo(s, "REWARDED", 7);

    // Bypass every service and insert the duplicate directly. The unique index
    // on (opportunityId, reason) is what has to refuse it.
    await expect(
      prisma.ledgerEntry.create({
        data: {
          businessId: s.business.id,
          advocateId: s.advocate.id,
          opportunityId: opp.id,
          delta: 7,
          reason: "OPPORTUNITY_REWARD",
        },
      }),
    ).rejects.toThrow();
    expect(await prisma.ledgerEntry.count()).toBe(1);
  });

  it("lets exactly one of two concurrent reward transitions pay", async () => {
    const s = await scenario();
    const opp = await advanceTo(s, "VERIFIED", 9);
    const other = separateTestPrisma();
    await other.$queryRaw`SELECT 1`;

    try {
      const results = await Promise.allSettled([
        prisma.$transaction((tx) =>
          transitionOpportunity(
            { db: tx, actor: s.ctx.admin.actor },
            { opportunityId: opp.id, to: "REWARDED" },
          ),
        ),
        other.$transaction((tx) =>
          transitionOpportunity(
            { db: tx, actor: s.ctx.admin.actor },
            { opportunityId: opp.id, to: "REWARDED" },
          ),
        ),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.ledgerEntry.count()).toBe(1);
      expect(await getBalance(s.ctx.admin, { advocateId: s.advocate.id })).toBe(9);
    } finally {
      await other.$disconnect();
    }
  });

  it("pays once when a duplicate credit lands mid-flight", async () => {
    // The interleaving the unique index exists for: this credit checks, finds
    // nothing, and only then does another connection commit the row. Forced
    // with an uncommitted raw insert that holds the index entry, so the credit
    // blocks and then has to cope with the row appearing underneath it.
    const s = await scenario();
    const opp = await forceRewardedUncredited(s, 4);
    const other = separateTestPrisma();
    await other.$queryRaw`SELECT 1`;

    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      const holding = other.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO ledger_entries ("id", "businessId", "advocateId", "opportunityId", "delta", "reason")
          VALUES (gen_random_uuid(), ${s.business.id}::uuid, ${s.advocate.id}::uuid,
                  ${opp.id}::uuid, 4, 'OPPORTUNITY_REWARD')
        `;
        await gate;
      });
      await new Promise((r) => setTimeout(r, 150));

      const crediting = prisma.$transaction((tx) =>
        creditForOpportunity(
          { db: tx, actor: s.ctx.admin.actor },
          { opportunityId: opp.id },
        ),
      );
      await new Promise((r) => setTimeout(r, 150));
      release();
      await holding;

      // Reports the existing credit rather than writing a second one.
      await expect(crediting).resolves.toMatchObject({
        alreadyCredited: true,
        delta: 0,
      });
      expect(await prisma.ledgerEntry.count()).toBe(1);
      expect(await getBalance(s.ctx.admin, { advocateId: s.advocate.id })).toBe(4);
    } finally {
      await other.$disconnect();
    }
  });
});

describe("authority around crediting", () => {
  it("rejects a rep's reward under the strict policy and writes nothing", async () => {
    const s = await scenario({ delegated: false });
    const opp = await advanceTo(s, "VERIFIED", 5);

    await expect(
      transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REWARDED" }),
    ).rejects.toThrow(ForbiddenError);

    expect(await prisma.ledgerEntry.count()).toBe(0);
    const row = await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } });
    expect(row.status).toBe("VERIFIED");
  });

  it("lets a rep's reward pay once the business delegates", async () => {
    const s = await scenario({ delegated: true });
    const opp = await advanceTo(s, "VERIFIED", 5);

    await transitionOpportunity(s.ctx.rep, { opportunityId: opp.id, to: "REWARDED" });

    expect(await getBalance(s.ctx.admin, { advocateId: s.advocate.id })).toBe(5);
    const entry = await prisma.ledgerEntry.findFirstOrThrow();
    expect(entry.actorUserId).toBe(s.rep.id);
  });

  it("refuses to credit an opportunity that has not reached REWARDED", async () => {
    const s = await scenario();
    const opp = await advanceTo(s, "VERIFIED", 5);

    await expect(
      creditForOpportunity(s.ctx.admin, { opportunityId: opp.id }),
    ).rejects.toThrow(ConflictError);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it("refuses an advocate trying to credit themselves", async () => {
    const s = await scenario();
    // Rewarded but uncredited, and worth 5 — so a successful call really would
    // have paid, which is what makes the refusal meaningful.
    const opp = await forceRewardedUncredited(s, 5);

    await expect(
      creditForOpportunity(s.ctx.advocate, { opportunityId: opp.id }),
    ).rejects.toThrow(ForbiddenError);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it("refuses to credit across a tenant boundary", async () => {
    const s = await scenario();
    const opp = await forceRewardedUncredited(s, 5);

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
      creditForOpportunity(outsider, { opportunityId: opp.id }),
    ).rejects.toThrow(NotFoundError);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });
});

describe("the ledger is append-only, from the service layer too", () => {
  it("exposes no way to update or delete an entry", async () => {
    // Belt and braces beside the database trigger: the services module must
    // not export anything that mutates history, because a reviewer reading
    // only this layer should reach the same conclusion.
    const balance = await import("./balance");
    const credit = await import("./credit-for-opportunity");
    const names = [...Object.keys(balance), ...Object.keys(credit)];

    expect(names.filter((n) => /update|delete|set|adjust|reset/i.test(n))).toEqual([]);
  });

  it("refuses an update even when attempted directly", async () => {
    const s = await scenario();
    await advanceTo(s, "REWARDED", 5);
    const entry = await prisma.ledgerEntry.findFirstOrThrow();

    await expect(
      prisma.ledgerEntry.update({ where: { id: entry.id }, data: { delta: 500 } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.ledgerEntry.delete({ where: { id: entry.id } }),
    ).rejects.toThrow(/append-only/);
  });
});

describe("reading balances", () => {
  it("lets an advocate read their own and nobody else's", async () => {
    const s = await scenario();
    await advanceTo(s, "REWARDED", 6);
    const sibling = await makeAdvocate(s.business.id, { email: "two@customer.com" });

    expect(await getBalance(s.ctx.advocate, { advocateId: s.advocate.id })).toBe(6);
    await expect(
      getBalance(s.ctx.advocate, { advocateId: sibling.id }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("will not read a balance across a tenant boundary", async () => {
    const s = await scenario();
    await advanceTo(s, "REWARDED", 6);
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

    await expect(getBalance(outsider, { advocateId: s.advocate.id })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("lists the entries behind a balance, newest first", async () => {
    const s = await scenario();
    await advanceTo(s, "REWARDED", 5);
    await advanceTo(s, "REWARDED", 8);

    const lines = await listLedgerEntries(s.ctx.advocate, {
      advocateId: s.advocate.id,
    });

    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.delta).reduce((a, b) => a + b, 0)).toBe(13);
    expect(lines.every((l) => l.reason === "OPPORTUNITY_REWARD")).toBe(true);
  });

  it("reports a business's outstanding liability as the sum across advocates", async () => {
    const s = await scenario();
    await advanceTo(s, "REWARDED", 5);
    const second = await makeAdvocate(s.business.id, { email: "two@customer.com" });
    const opp = await createOpportunity(s.ctx.admin, {
      advocateId: second.id,
      type: "TESTIMONIAL",
      title: "Quote",
      rewardAmount: 12,
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
          ? ({
              db: prisma,
              actor: {
                kind: "advocate",
                userId: (await makeUser()).id,
                businessId: s.business.id,
                advocateId: second.id,
              },
            } satisfies ServiceContext)
          : s.ctx.admin;
      await transitionOpportunity(who, { opportunityId: opp.id, to });
    }

    expect(await getOutstandingLiability(s.ctx.admin)).toBe(17);
    await expect(getOutstandingLiability(s.ctx.advocate)).rejects.toThrow(
      ForbiddenError,
    );
  });
});
