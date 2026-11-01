import type { Db } from "@/server/db";
import { ensureUser } from "@/server/services/identity/ensure-user";
import { createBusiness, type CreatedBusiness } from "./create-business";
import { grantPlatformStaff, resolvePlatformStaffActor } from "./platform-staff";

/**
 * The onboarding chains, as services rather than script bodies.
 *
 * The scripts that call these can only be exercised by hand — they talk to
 * Supabase's admin API to provision an auth user, which no test should do. So
 * everything *after* that call lives here, where it is covered, and the scripts
 * keep nothing but argument parsing, one Supabase call and printing.
 *
 * Both take a `Db` so the caller can pass a transaction client. Do pass one:
 * these write several rows, and half-onboarding a business leaves a user who
 * can sign in and reach nothing.
 */

export type OnboardBusinessInput = {
  readonly supabaseUserId: string;
  readonly adminEmail: string;
  readonly adminName?: string | undefined;
  readonly name: string;
  readonly slug: string;
  readonly requireAdminApprovalForOpportunities: boolean;
  readonly requireAdminApprovalForRewards: boolean;
  /** Which staff member to attribute this to. Omit when there is only one. */
  readonly actingStaffEmail?: string | undefined;
};

export type OnboardedBusiness = {
  readonly business: CreatedBusiness;
  readonly adminUserId: string;
  readonly actingStaffUserId: string;
};

export async function onboardBusiness(
  db: Db,
  input: OnboardBusinessInput,
): Promise<OnboardedBusiness> {
  // Resolved first so an unattributable run fails before it writes anything.
  const actor = await resolvePlatformStaffActor(db, {
    ...(input.actingStaffEmail && { email: input.actingStaffEmail }),
  });

  const adminUser = await ensureUser(db, {
    supabaseUserId: input.supabaseUserId,
    email: input.adminEmail,
    name: input.adminName ?? null,
  });

  const business = await createBusiness(
    { db, actor },
    {
      name: input.name,
      slug: input.slug,
      adminUserId: adminUser.id,
      requireAdminApprovalForOpportunities: input.requireAdminApprovalForOpportunities,
      requireAdminApprovalForRewards: input.requireAdminApprovalForRewards,
    },
  );

  return { business, adminUserId: adminUser.id, actingStaffUserId: actor.userId };
}

export type OnboardPlatformStaffInput = {
  readonly supabaseUserId: string;
  readonly email: string;
  readonly name?: string | undefined;
};

export async function onboardPlatformStaff(
  db: Db,
  input: OnboardPlatformStaffInput,
): Promise<{ userId: string; alreadyHeld: boolean }> {
  const user = await ensureUser(db, {
    supabaseUserId: input.supabaseUserId,
    email: input.email,
    name: input.name ?? null,
  });
  return grantPlatformStaff(db, { userId: user.id });
}
