import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeBusiness, makeUser } from "@/test/integration/fixtures";
import { grantPlatformStaff, resolvePlatformStaffActor } from "./platform-staff";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

describe("grantPlatformStaff", () => {
  it("grants staff status", async () => {
    const user = await makeUser();

    const result = await grantPlatformStaff(prisma, { userId: user.id });

    expect(result.alreadyHeld).toBe(false);
    expect(await prisma.platformStaff.count({ where: { userId: user.id } })).toBe(1);
  });

  it("is idempotent", async () => {
    const user = await makeUser();
    await grantPlatformStaff(prisma, { userId: user.id });

    const again = await grantPlatformStaff(prisma, { userId: user.id });

    expect(again.alreadyHeld).toBe(true);
    expect(await prisma.platformStaff.count({ where: { userId: user.id } })).toBe(1);
  });

  it("refuses a user who does not exist", async () => {
    await expect(
      grantPlatformStaff(prisma, { userId: "01930000-0000-7000-8000-00000000dead" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("confers no business-scoped access — invariant 6", async () => {
    const [user, business] = await Promise.all([makeUser(), makeBusiness()]);
    await grantPlatformStaff(prisma, { userId: user.id });

    // Staff status is its own table. It creates no membership and no advocate
    // record, so there is no business whose data this user can reach. In the
    // prototype the equivalent grant also opened every customer's records.
    expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.advocate.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.membership.count({ where: { businessId: business.id } })).toBe(
      0,
    );
  });
});

describe("resolvePlatformStaffActor", () => {
  it("returns the only staff member when there is one", async () => {
    const user = await makeUser();
    await grantPlatformStaff(prisma, { userId: user.id });

    const actor = await resolvePlatformStaffActor(prisma);

    expect(actor).toEqual({ kind: "platform_staff", userId: user.id });
  });

  it("refuses when there is none, and says how to fix it", async () => {
    await expect(resolvePlatformStaffActor(prisma)).rejects.toThrow(
      /grant-platform-staff/,
    );
  });

  it("refuses to guess between several", async () => {
    const [a, b] = await Promise.all([makeUser(), makeUser()]);
    await grantPlatformStaff(prisma, { userId: a.id });
    await grantPlatformStaff(prisma, { userId: b.id });

    await expect(resolvePlatformStaffActor(prisma)).rejects.toThrow(ConflictError);
  });

  it("picks the named one when there are several", async () => {
    const [a, b] = await Promise.all([
      makeUser({ email: "a@dealio.info" }),
      makeUser({ email: "b@dealio.info" }),
    ]);
    await grantPlatformStaff(prisma, { userId: a.id });
    await grantPlatformStaff(prisma, { userId: b.id });

    const actor = await resolvePlatformStaffActor(prisma, { email: "b@dealio.info" });

    expect(actor.userId).toBe(b.id);
  });

  it("refuses an email that is not staff, even when the user exists", async () => {
    await makeUser({ email: "outsider@example.com" });

    await expect(
      resolvePlatformStaffActor(prisma, { email: "outsider@example.com" }),
    ).rejects.toThrow(NotFoundError);
  });
});
