import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectTestPrisma, resetDb, testPrisma } from "./harness";
import {
  makeAdvocate,
  makeBusiness,
  makeOpportunity,
  makeTenant,
  makeUser,
} from "./fixtures";

/**
 * Task 2 acceptance: the committed migrations apply to a real Postgres, the
 * harness isolates tests from each other, and the invariants that CLAUDE.md
 * states are actually enforced by the database rather than only by convention.
 *
 * That last part is the point. The prototype relied on application discipline
 * for exactly these rules and lost real money to it, so each one has a test
 * that tries to break it directly, bypassing any service layer.
 */

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

describe("migrations", () => {
  it("applied the full schema", async () => {
    const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    const tables = rows.map((r) => r.tablename);

    expect(tables).toEqual(
      expect.arrayContaining([
        "advocate_invites",
        "advocates",
        "businesses",
        "ledger_entries",
        "memberships",
        "opportunities",
        "opportunity_events",
        "platform_staff",
        "redemptions",
        "rewards",
        "users",
      ]),
    );
  });

  it("recorded the migration history", async () => {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `;
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("harness isolation", () => {
  it("starts empty and can write", async () => {
    expect(await prisma.business.count()).toBe(0);
    await makeBusiness();
    expect(await prisma.business.count()).toBe(1);
  });

  it("does not see the previous test's data", async () => {
    expect(await prisma.business.count()).toBe(0);
  });
});

describe("ledger is append-only", () => {
  async function seedEntry() {
    const { business, advocate } = await makeTenant();
    const entry = await prisma.ledgerEntry.create({
      data: {
        businessId: business.id,
        advocateId: advocate.id,
        delta: 5,
        reason: "OPPORTUNITY_REWARD",
      },
    });
    return { business, advocate, entry };
  }

  it("rejects an update", async () => {
    const { entry } = await seedEntry();
    await expect(
      prisma.ledgerEntry.update({ where: { id: entry.id }, data: { delta: 9999 } }),
    ).rejects.toThrow(/append-only/i);
  });

  it("rejects a delete", async () => {
    const { entry } = await seedEntry();
    await expect(
      prisma.ledgerEntry.delete({ where: { id: entry.id } }),
    ).rejects.toThrow(/append-only/i);
  });

  it("leaves the row intact after a rejected update", async () => {
    const { entry } = await seedEntry();
    await expect(
      prisma.ledgerEntry.update({ where: { id: entry.id }, data: { delta: 9999 } }),
    ).rejects.toThrow();

    const after = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(after.delta).toBe(5);
  });
});

describe("ledger constraints", () => {
  it("rejects a zero delta", async () => {
    const { business, advocate } = await makeTenant();
    await expect(
      prisma.ledgerEntry.create({
        data: {
          businessId: business.id,
          advocateId: advocate.id,
          delta: 0,
          reason: "MANUAL_ADJUSTMENT",
          note: "no-op",
        },
      }),
    ).rejects.toThrow(/delta_not_zero/);
  });

  it("requires a note on a manual adjustment", async () => {
    const { business, advocate } = await makeTenant();
    const base = {
      businessId: business.id,
      advocateId: advocate.id,
      delta: 3,
      reason: "MANUAL_ADJUSTMENT" as const,
    };

    await expect(prisma.ledgerEntry.create({ data: base })).rejects.toThrow(
      /adjustment_requires_note/,
    );
    await expect(
      prisma.ledgerEntry.create({ data: { ...base, note: "   " } }),
    ).rejects.toThrow(/adjustment_requires_note/);

    const ok = await prisma.ledgerEntry.create({
      data: { ...base, note: "Goodwill credit, approved by ops" },
    });
    expect(ok.delta).toBe(3);
  });
});

describe("balance is derived, not stored", () => {
  it("sums credits and debits", async () => {
    const { business, advocate } = await makeTenant();
    await prisma.ledgerEntry.createMany({
      data: [
        {
          businessId: business.id,
          advocateId: advocate.id,
          delta: 10,
          reason: "OPPORTUNITY_REWARD",
        },
        {
          businessId: business.id,
          advocateId: advocate.id,
          delta: -4,
          reason: "REDEMPTION",
        },
        {
          businessId: business.id,
          advocateId: advocate.id,
          delta: 4,
          reason: "FULFILLMENT_FAILED",
        },
      ],
    });

    const { _sum } = await prisma.ledgerEntry.aggregate({
      where: { advocateId: advocate.id },
      _sum: { delta: true },
    });
    expect(_sum.delta).toBe(10);
  });

  it("has no stored balance column to drift", async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'advocates'
    `;
    const names = columns.map((c) => c.column_name);
    expect(names).not.toContain("balance");
    expect(names).not.toContain("coinsEarned");
    expect(names).not.toContain("coins_earned");
  });
});

describe("reward crediting is idempotent at the database level", () => {
  it("allows only one reward credit per opportunity", async () => {
    const { business, advocate, user } = await makeTenant();
    const opportunity = await makeOpportunity({
      businessId: business.id,
      advocateId: advocate.id,
      createdByUserId: user.id,
    });

    const entry = {
      businessId: business.id,
      advocateId: advocate.id,
      delta: 5,
      reason: "OPPORTUNITY_REWARD" as const,
      opportunityId: opportunity.id,
    };

    await prisma.ledgerEntry.create({ data: entry });
    // A double-submit, a retried job or a racing request must not pay twice.
    await expect(prisma.ledgerEntry.create({ data: entry })).rejects.toThrow();

    expect(
      await prisma.ledgerEntry.count({ where: { opportunityId: opportunity.id } }),
    ).toBe(1);
  });

  it("still allows unrelated entries with no opportunity", async () => {
    const { business, advocate } = await makeTenant();
    const base = {
      businessId: business.id,
      advocateId: advocate.id,
      delta: 1,
      reason: "OPPORTUNITY_REWARD" as const,
    };
    await prisma.ledgerEntry.create({ data: base });
    await prisma.ledgerEntry.create({ data: base });
    expect(await prisma.ledgerEntry.count()).toBe(2);
  });
});

describe("tenant scoping", () => {
  it("scopes advocate email uniqueness to the business, not globally", async () => {
    const [a, b] = await Promise.all([makeBusiness(), makeBusiness()]);
    const email = "shared.person@example.com";

    await makeAdvocate(a.id, { email });
    // The same human may advocate for two different Dealio customers.
    await expect(makeAdvocate(b.id, { email })).resolves.toMatchObject({
      businessId: b.id,
    });
    // But not twice for the same one.
    await expect(makeAdvocate(a.id, { email })).rejects.toThrow();
  });

  it("defaults a new business to requiring admin approval", async () => {
    const business = await makeBusiness();
    expect(business.requireAdminApprovalForOpportunities).toBe(true);
    expect(business.requireAdminApprovalForRewards).toBe(true);
  });

  it("keeps platform staff separate from business membership", async () => {
    const user = await makeUser();
    await prisma.platformStaff.create({ data: { userId: user.id } });

    // Platform staff confers no membership, so no business-scoped access.
    expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("money constraints", () => {
  it("rejects a negative reward cost", async () => {
    const business = await makeBusiness();
    await expect(
      prisma.reward.create({
        data: { businessId: business.id, name: "Bad", cost: -1 },
      }),
    ).rejects.toThrow(/cost_non_negative/);
  });

  it("rejects a negative opportunity reward amount", async () => {
    const { business, advocate, user } = await makeTenant();
    await expect(
      makeOpportunity(
        { businessId: business.id, advocateId: advocate.id, createdByUserId: user.id },
        { rewardAmount: -5 },
      ),
    ).rejects.toThrow(/reward_amount_non_negative/);
  });

  it("stores influenced revenue as integer cents", async () => {
    const { business, advocate, user } = await makeTenant();
    const opportunity = await makeOpportunity({
      businessId: business.id,
      advocateId: advocate.id,
      createdByUserId: user.id,
    });

    const updated = await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: { influencedRevenueCents: 12_345_678_90n },
    });
    expect(updated.influencedRevenueCents).toBe(12_345_678_90n);
  });
});

describe("redemption snapshots", () => {
  it("keeps the reward's name as it was when the redemption was requested", async () => {
    const { business, advocate } = await makeTenant();
    const reward = await prisma.reward.create({
      data: { businessId: business.id, name: "$25 Coffee Card", cost: 5 },
    });

    const redemption = await prisma.redemption.create({
      data: {
        businessId: business.id,
        advocateId: advocate.id,
        rewardId: reward.id,
        rewardName: reward.name,
        cost: reward.cost,
      },
    });

    // The catalog is edited afterwards: renamed and repriced.
    await prisma.reward.update({
      where: { id: reward.id },
      data: { name: "$50 Coffee Card", cost: 10 },
    });

    const after = await prisma.redemption.findUniqueOrThrow({
      where: { id: redemption.id },
    });
    expect(after.rewardName).toBe("$25 Coffee Card");
    expect(after.cost).toBe(5);
  });

  it("will not record a redemption without the reward's name", async () => {
    const { business, advocate } = await makeTenant();
    const reward = await prisma.reward.create({
      data: { businessId: business.id, name: "Gift Card", cost: 5 },
    });

    await expect(
      prisma.$executeRaw`
        INSERT INTO redemptions
          ("id", "businessId", "advocateId", "rewardId", "cost", "updatedAt")
        VALUES (gen_random_uuid(), ${business.id}::uuid, ${advocate.id}::uuid,
                ${reward.id}::uuid, 5, now())
      `,
    ).rejects.toThrow(/rewardName/);
  });

  it("refuses to delete a reward that a redemption still points at", async () => {
    const { business, advocate } = await makeTenant();
    const reward = await prisma.reward.create({
      data: { businessId: business.id, name: "Gift Card", cost: 5 },
    });
    await prisma.redemption.create({
      data: {
        businessId: business.id,
        advocateId: advocate.id,
        rewardId: reward.id,
        rewardName: reward.name,
        cost: reward.cost,
      },
    });

    // Soft-deactivation is the supported path; a hard delete must not orphan
    // history. The prototype made its FK `ON DELETE SET NULL` instead.
    await expect(prisma.reward.delete({ where: { id: reward.id } })).rejects.toThrow();
  });
});
