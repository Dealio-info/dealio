import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type PlatformServiceContext,
} from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeUser } from "@/test/integration/fixtures";
import { createBusiness } from "./create-business";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

function staffContext(userId: string): PlatformServiceContext {
  return { db: prisma, actor: { kind: "platform_staff", userId } };
}

describe("createBusiness", () => {
  it("creates the business with its first admin in one go", async () => {
    const [staff, admin] = await Promise.all([makeUser(), makeUser()]);

    const business = await createBusiness(staffContext(staff.id), {
      name: "Acme Corp",
      slug: "acme-corp",
      adminUserId: admin.id,
    });

    const memberships = await prisma.membership.findMany({
      where: { businessId: business.id },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ userId: admin.id, role: "BUSINESS_ADMIN" });
  });

  it("defaults both approval flags to requiring an admin", async () => {
    const [staff, admin] = await Promise.all([makeUser(), makeUser()]);

    const business = await createBusiness(staffContext(staff.id), {
      name: "Acme Corp",
      slug: "acme-corp",
      adminUserId: admin.id,
    });

    expect(business.requireAdminApprovalForOpportunities).toBe(true);
    expect(business.requireAdminApprovalForRewards).toBe(true);
  });

  it("accepts a delegated policy at creation time", async () => {
    const [staff, admin] = await Promise.all([makeUser(), makeUser()]);

    const business = await createBusiness(staffContext(staff.id), {
      name: "Globex",
      slug: "globex",
      adminUserId: admin.id,
      requireAdminApprovalForOpportunities: false,
      requireAdminApprovalForRewards: false,
    });

    expect(business.requireAdminApprovalForOpportunities).toBe(false);
    expect(business.requireAdminApprovalForRewards).toBe(false);
  });

  it("refuses a caller who is not platform staff", async () => {
    const [user, admin] = await Promise.all([makeUser(), makeUser()]);

    // Cast past the type, which is what a careless caller or a JS consumer
    // would effectively do. The runtime check is the one that matters.
    const notStaff = {
      db: prisma,
      actor: {
        kind: "business",
        userId: user.id,
        businessId: "x",
        role: "BUSINESS_ADMIN",
      },
    } as unknown as PlatformServiceContext;

    await expect(
      createBusiness(notStaff, { name: "Hooli", slug: "hooli", adminUserId: admin.id }),
    ).rejects.toThrow(ForbiddenError);
    expect(await prisma.business.count()).toBe(0);
  });

  it("refuses a slug that is already taken", async () => {
    const [staff, a, b] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    await createBusiness(staffContext(staff.id), {
      name: "Acme",
      slug: "acme",
      adminUserId: a.id,
    });

    await expect(
      createBusiness(staffContext(staff.id), {
        name: "Acme Again",
        slug: "acme",
        adminUserId: b.id,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses an admin user that does not exist, and creates nothing", async () => {
    const staff = await makeUser();

    await expect(
      createBusiness(staffContext(staff.id), {
        name: "Ghost",
        slug: "ghost",
        adminUserId: "01930000-0000-7000-8000-00000000dead",
      }),
    ).rejects.toThrow(NotFoundError);
    expect(await prisma.business.count()).toBe(0);
  });

  it("confers no business-scoped access on the staff member who created it", async () => {
    const [staff, admin] = await Promise.all([makeUser(), makeUser()]);
    const business = await createBusiness(staffContext(staff.id), {
      name: "Acme",
      slug: "acme",
      adminUserId: admin.id,
    });

    // Platform staff is a separate table, not a role, and creating a tenant
    // does not make you a member of it. This is the prototype's worst defect
    // (invariant 6) asserted directly.
    const staffMemberships = await prisma.membership.findMany({
      where: { userId: staff.id },
    });
    expect(staffMemberships).toEqual([]);

    // Nor is there any other route in: no advocate record, and the business
    // itself knows nothing of them.
    const staffAdvocates = await prisma.advocate.findMany({
      where: { userId: staff.id },
    });
    expect(staffAdvocates).toEqual([]);
    expect(await prisma.membership.count({ where: { businessId: business.id } })).toBe(
      1,
    );
  });
});
