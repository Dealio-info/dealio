import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, soleTenantContext, ForbiddenError } from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeBusiness } from "@/test/integration/fixtures";
import { ensureUser } from "./ensure-user";
import { resolveIdentity } from "./resolve-identity";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

describe("ensureUser", () => {
  it("creates the row on first sign-in", async () => {
    const supabaseUserId = randomUUID();
    const user = await ensureUser(prisma, {
      supabaseUserId,
      email: "new@example.com",
      name: "New Person",
    });

    expect(user.email).toBe("new@example.com");
    expect(await prisma.user.count()).toBe(1);
  });

  it("is idempotent across repeated sign-ins", async () => {
    const supabaseUserId = randomUUID();
    const input = { supabaseUserId, email: "same@example.com", name: "Same" };

    const first = await ensureUser(prisma, input);
    const second = await ensureUser(prisma, input);

    expect(second.id).toBe(first.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it("confers no access by itself", async () => {
    // Signing up is not how anyone gets into a business. Access comes from an
    // invite creating a Membership or an Advocate record.
    const supabaseUserId = randomUUID();
    await makeBusiness();
    await ensureUser(prisma, { supabaseUserId, email: "outsider@example.com" });

    const identity = await resolveIdentity(prisma, supabaseUserId);
    expect(identity.memberships).toEqual([]);
    expect(identity.advocates).toEqual([]);
    expect(identity.isPlatformStaff).toBe(false);
    expect(() => soleTenantContext(identity)).toThrow(ForbiddenError);
  });

  it("follows an email change for the same auth user", async () => {
    const supabaseUserId = randomUUID();
    const created = await ensureUser(prisma, {
      supabaseUserId,
      email: "old@example.com",
    });
    const updated = await ensureUser(prisma, {
      supabaseUserId,
      email: "new@example.com",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.email).toBe("new@example.com");
    expect(await prisma.user.count()).toBe(1);
  });

  it("refuses to move an email between auth users", async () => {
    // An account-takeover shape: a different Supabase identity turning up with
    // an email that already belongs to someone. Refuse and let a human look.
    await ensureUser(prisma, {
      supabaseUserId: randomUUID(),
      email: "taken@example.com",
    });

    await expect(
      ensureUser(prisma, { supabaseUserId: randomUUID(), email: "taken@example.com" }),
    ).rejects.toThrow(ConflictError);

    expect(await prisma.user.count()).toBe(1);
  });

  it("does not blank an existing name when a provider sends none", async () => {
    const supabaseUserId = randomUUID();
    await ensureUser(prisma, {
      supabaseUserId,
      email: "named@example.com",
      name: "From Google",
    });
    // A later magic-link sign-in carries no name.
    await ensureUser(prisma, { supabaseUserId, email: "named@example.com" });

    const row = await prisma.user.findUniqueOrThrow({ where: { supabaseUserId } });
    expect(row.name).toBe("From Google");
  });

  it("composes into a caller's transaction", async () => {
    const supabaseUserId = randomUUID();
    const business = await makeBusiness();

    // The realistic first-sign-in flow: provision the user and attach an
    // invited membership atomically.
    await prisma.$transaction(async (tx) => {
      const user = await ensureUser(tx, { supabaseUserId, email: "tx@example.com" });
      await tx.membership.create({
        data: { userId: user.id, businessId: business.id, role: "REP" },
      });
    });

    const identity = await resolveIdentity(prisma, supabaseUserId);
    expect(soleTenantContext(identity).businessId).toBe(business.id);
  });

  it("rolls back with the caller's transaction", async () => {
    const supabaseUserId = randomUUID();

    await expect(
      prisma.$transaction(async (tx) => {
        await ensureUser(tx, { supabaseUserId, email: "rollback@example.com" });
        throw new Error("caller failed after provisioning");
      }),
    ).rejects.toThrow("caller failed after provisioning");

    expect(await prisma.user.count()).toBe(0);
  });
});
