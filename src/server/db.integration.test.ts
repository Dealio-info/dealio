import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inTransaction } from "./db";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeBusiness } from "@/test/integration/fixtures";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

/**
 * `inTransaction` is what makes invariant 1 hold when services compose: a
 * currency movement and the ledger row recording it must be atomic whether or
 * not the caller already opened a transaction.
 *
 * Both branches need their own test. A test that passes a transaction client in
 * only exercises the join, and stays green even if the helper never opens one —
 * which is how the first version of this missed the bug it was written for.
 */
describe("inTransaction", () => {
  it("opens its own transaction when handed the client", async () => {
    await expect(
      inTransaction(prisma, async (tx) => {
        await tx.business.create({
          data: { name: "Rolled back", slug: "rolled-back" },
        });
        throw new Error("fail after the write");
      }),
    ).rejects.toThrow("fail after the write");

    // The branch under test: with no transaction of its own, this row would
    // have survived the throw.
    expect(await prisma.business.count({ where: { slug: "rolled-back" } })).toBe(0);
  });

  it("commits when the callback succeeds", async () => {
    await inTransaction(prisma, async (tx) => {
      await tx.business.create({ data: { name: "Kept", slug: "kept" } });
    });

    expect(await prisma.business.count({ where: { slug: "kept" } })).toBe(1);
  });

  it("joins the caller's transaction rather than nesting", async () => {
    await expect(
      prisma.$transaction(async (outer) => {
        await inTransaction(outer, async (tx) => {
          await tx.business.create({ data: { name: "Inner", slug: "inner" } });
        });
        // Visible to the outer transaction, so the write really did happen in
        // it — Postgres has no nested transactions to have happened in instead.
        expect(await outer.business.count({ where: { slug: "inner" } })).toBe(1);
        throw new Error("outer fails");
      }),
    ).rejects.toThrow("outer fails");

    // And the outer rollback takes the inner write with it.
    expect(await prisma.business.count({ where: { slug: "inner" } })).toBe(0);
  });

  it("returns the callback's value", async () => {
    const business = await makeBusiness();
    const found = await inTransaction(prisma, (tx) =>
      tx.business.findUniqueOrThrow({ where: { id: business.id } }),
    );
    expect(found.id).toBe(business.id);
  });
});
