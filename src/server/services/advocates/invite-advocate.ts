import {
  ConflictError,
  assertBusinessActor,
  type ServiceContext,
} from "@/server/context";
import { generateInviteToken } from "./invite-token";

/** Long enough to survive a holiday, short enough that a stale link dies. */
const DEFAULT_EXPIRY_DAYS = 14;

export type InviteAdvocateInput = {
  readonly email: string;
  readonly name?: string | null;
  readonly company?: string | null;
  readonly title?: string | null;
  readonly expiresInDays?: number;
};

export type AdvocateInvitation = {
  readonly advocateId: string;
  readonly email: string;
  /**
   * The plaintext token, returned **once**. Put it in a link and send it; it
   * cannot be recovered afterwards because only its hash is stored.
   */
  readonly token: string;
  readonly expiresAt: Date;
  /** True when this re-invited someone who had not yet claimed. */
  readonly reinvited: boolean;
};

/**
 * Invite someone to be an advocate of the caller's business.
 *
 * Any staff member may do this, rep included — gathering advocates is the
 * rep's job, and an invite confers nothing by itself. What the advocate can
 * then *earn* is governed by the approval policy, which is where the authority
 * question actually lives.
 *
 * The email is lowercased and trimmed here rather than at the boundary,
 * because `(businessId, email)` is unique and the normalisation is what makes
 * that constraint mean "one invite per person" instead of "one per spelling".
 */
export async function inviteAdvocate(
  ctx: ServiceContext,
  input: InviteAdvocateInput,
): Promise<AdvocateInvitation> {
  assertBusinessActor(ctx.actor);
  const businessId = ctx.actor.businessId;
  const email = input.email.trim().toLowerCase();

  const existing = await ctx.db.advocate.findUnique({
    where: { businessId_email: { businessId, email } },
    select: { id: true, userId: true, status: true },
  });

  if (existing?.userId) {
    throw new ConflictError("That person is already an advocate of this business");
  }
  if (existing?.status === "INACTIVE") {
    // Reactivating someone a business deliberately switched off is a decision,
    // not a side effect of re-inviting. It needs its own operation so it is
    // visible; silently flipping them back is how a removed advocate quietly
    // regains access.
    throw new ConflictError(
      "That advocate was deactivated. Reactivate them rather than re-inviting.",
    );
  }

  const { token, tokenHash } = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + (input.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 86_400_000,
  );

  const advocateId =
    existing?.id ??
    (
      await ctx.db.advocate.create({
        data: {
          businessId,
          email,
          name: input.name ?? null,
          company: input.company ?? null,
          title: input.title ?? null,
        },
        select: { id: true },
      })
    ).id;

  if (existing) {
    // Only the newest link works, matching how Supabase treats its own
    // tokens — two live invites for one person is a confusing support call.
    // Expiring rather than deleting keeps the record that they were invited.
    await ctx.db.advocateInvite.updateMany({
      where: { advocateId, claimedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    });
  }

  await ctx.db.advocateInvite.create({
    data: { advocateId, tokenHash, expiresAt },
  });

  return { advocateId, email, token, expiresAt, reinvited: existing !== null };
}
