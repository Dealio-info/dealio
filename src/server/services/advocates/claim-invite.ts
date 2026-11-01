import type { Db } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/context";
import { hashInviteToken } from "./invite-token";

export type ClaimInviteInput = {
  readonly token: string;
  /** The domain `User` doing the claiming, from their session. */
  readonly userId: string;
};

export type ClaimedInvite = {
  readonly advocateId: string;
  readonly businessId: string;
  /** True when this user had already claimed it — a repeat, not a failure. */
  readonly alreadyClaimed: boolean;
};

/**
 * Link a signed-in user to the `Advocate` record an invite was issued for.
 *
 * Takes a `Db` and a `userId`, **not** a `ServiceContext`. That is the whole
 * point of this function: the person claiming has no tenant context yet. The
 * invite is what gives them one, so requiring one here would be circular.
 *
 * **The token is the only accepted proof, and that is a decision.** The
 * original plan allowed falling back to an email match when Supabase reported
 * the address verified; `docs/decisions.md` later closed that off and this
 * follows the later decision. The prototype matched on a bare lowercased email
 * inside a `SECURITY DEFINER` function, which was spoofable whenever email
 * confirmation was off — and it is currently off here during development. An
 * email fallback is precisely what would make that setting load-bearing again.
 * Do not add one.
 *
 * Pass a transaction client: this writes two rows and half of it leaves an
 * invite burned with nobody linked to it.
 */
export async function claimInvite(
  db: Db,
  input: ClaimInviteInput,
): Promise<ClaimedInvite> {
  const invite = await db.advocateInvite.findUnique({
    where: { tokenHash: hashInviteToken(input.token) },
    select: {
      id: true,
      expiresAt: true,
      claimedAt: true,
      advocate: { select: { id: true, businessId: true, userId: true, status: true } },
    },
  });

  // Deliberately the same answer for "no such token" as for a malformed one:
  // there is nothing to learn from the difference.
  if (!invite) {
    throw new NotFoundError("That invite link is not valid");
  }

  const { advocate } = invite;

  // A repeat of a claim this same user already made is success, not an error.
  // Otherwise a double-click, a prefetch or a back button reads as a failure
  // on a link that did exactly what it was supposed to.
  if (invite.claimedAt && advocate.userId === input.userId) {
    return {
      advocateId: advocate.id,
      businessId: advocate.businessId,
      alreadyClaimed: true,
    };
  }

  if (invite.claimedAt) {
    throw new ConflictError("That invite link has already been used");
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new ConflictError("That invite link has expired; ask for a new one");
  }
  if (advocate.userId) {
    throw new ConflictError(
      "That advocate record is already linked to another account",
    );
  }
  if (advocate.status === "INACTIVE") {
    throw new ConflictError("That advocate record has been deactivated");
  }

  // Burn the token with a conditional update rather than a read-then-write, so
  // two simultaneous claims cannot both pass the checks above. The lost-update
  // race this avoids is the one that cost the prototype real money on its
  // currency paths.
  const burned = await db.advocateInvite.updateMany({
    where: { id: invite.id, claimedAt: null },
    data: { claimedAt: new Date() },
  });
  if (burned.count !== 1) {
    throw new ConflictError("That invite link has already been used");
  }

  const linked = await db.advocate.updateMany({
    // `businessId` is absent from `data` on purpose: claiming links a person to
    // the business that invited them and can never move them to another.
    where: { id: advocate.id, userId: null },
    data: { userId: input.userId, status: "ACTIVE", lastActiveAt: new Date() },
  });
  if (linked.count !== 1) {
    throw new ConflictError(
      "That advocate record is already linked to another account",
    );
  }

  return {
    advocateId: advocate.id,
    businessId: advocate.businessId,
    alreadyClaimed: false,
  };
}
