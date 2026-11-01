import type { Db } from "@/server/db";
import {
  ConflictError,
  NotFoundError,
  type PlatformStaffActor,
} from "@/server/context";

/**
 * Grant a user Dealio-staff status.
 *
 * Takes a `Db` rather than a `ServiceContext`, and deliberately checks no
 * actor. This is the bootstrap: the very first platform staff member cannot be
 * granted by a platform staff member. Running it requires `DATABASE_URL`, and
 * anyone holding that can write the row by hand anyway — so an authority check
 * here would be theatre, not security.
 *
 * That is also precisely why this is a script-only operation with no route and
 * no UI. If it ever needs one, the check has to come from somewhere real.
 *
 * Idempotent: granting twice is a no-op, not an error.
 */
export async function grantPlatformStaff(
  db: Db,
  input: { readonly userId: string },
): Promise<{ userId: string; alreadyHeld: boolean }> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });
  if (!user) {
    throw new NotFoundError("No such user");
  }

  const existing = await db.platformStaff.findUnique({
    where: { userId: input.userId },
    select: { userId: true },
  });
  if (existing) {
    return { userId: input.userId, alreadyHeld: true };
  }

  await db.platformStaff.create({ data: { userId: input.userId } });
  return { userId: input.userId, alreadyHeld: false };
}

/**
 * Find the platform staff member a script should act as.
 *
 * With an email, that one. Without, the only one there is — and a refusal
 * rather than a guess when there are several, for the same reason
 * `soleTenantContext` refuses: picking the first match attributes an action to
 * the wrong person, and the record of who onboarded a business is the only
 * audit trail this operation has.
 */
export async function resolvePlatformStaffActor(
  db: Db,
  input: { readonly email?: string } = {},
): Promise<PlatformStaffActor> {
  if (input.email) {
    const staff = await db.platformStaff.findFirst({
      where: { user: { email: input.email } },
      select: { userId: true },
    });
    if (!staff) {
      throw new NotFoundError(`${input.email} is not Dealio staff`);
    }
    return { kind: "platform_staff", userId: staff.userId };
  }

  const all = await db.platformStaff.findMany({ select: { userId: true }, take: 2 });
  const [only] = all;
  if (!only) {
    throw new NotFoundError(
      "There is no Dealio staff member yet. Run scripts/grant-platform-staff.ts first.",
    );
  }
  if (all.length > 1) {
    throw new ConflictError(
      "There is more than one Dealio staff member; say which one with --as <email>.",
    );
  }
  return { kind: "platform_staff", userId: only.userId };
}
