import type { Db } from "@/server/db";
import { UnauthenticatedError, type Identity } from "@/server/context";

/**
 * Load everything the database knows about one signed-in human.
 *
 * Takes the Supabase auth user id — the only identifier a session carries — and
 * returns an `Identity` the caller turns into a specific actor with
 * `businessActor`, `advocateActor`, `platformStaffActor` or `soleTenantContext`.
 *
 * Does **not** create the `User` row. A brand-new Supabase user has no row
 * here, and this throws `UnauthenticatedError` for them: as far as the domain
 * is concerned we do not know them yet. Provisioning on first sign-in belongs
 * to the auth flow (Task 4), which runs before this.
 */
export async function resolveIdentity(
  db: Db,
  supabaseUserId: string,
): Promise<Identity> {
  const user = await db.user.findUnique({
    where: { supabaseUserId },
    select: {
      id: true,
      email: true,
      platformStaff: { select: { userId: true } },
      memberships: { select: { businessId: true, role: true } },
      advocateProfiles: {
        // Only claimed, active advocate records confer a context. An advocate
        // the business has deactivated must lose access, and an unclaimed
        // invite has no `userId` so cannot match here at all.
        where: { status: "ACTIVE" },
        select: { id: true, businessId: true },
      },
    },
  });

  if (!user) {
    throw new UnauthenticatedError("No account for this sign-in");
  }

  return {
    user: { id: user.id, email: user.email },
    isPlatformStaff: user.platformStaff !== null,
    memberships: user.memberships,
    advocates: user.advocateProfiles.map((a) => ({
      advocateId: a.id,
      businessId: a.businessId,
    })),
  };
}
