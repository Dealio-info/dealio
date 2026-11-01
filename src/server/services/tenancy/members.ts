import { Prisma } from "@/generated/prisma/client";
import type { MembershipRole } from "@/generated/prisma/enums";
import {
  ConflictError,
  NotFoundError,
  assertBusinessActor,
  assertBusinessAdmin,
  type ServiceContext,
} from "@/server/context";

export type AddMemberInput = {
  readonly userId: string;
  readonly role: MembershipRole;
};

export type Member = {
  readonly id: string;
  readonly userId: string;
  readonly role: MembershipRole;
  readonly email: string;
  readonly name: string | null;
  readonly createdAt: Date;
};

/**
 * Add an existing user to the caller's own business.
 *
 * Note what this signature does *not* take: a `businessId`. It comes from
 * `ctx.actor`, so "add a member to a business I am not an admin of" is not a
 * request that can be expressed — which is a stronger guarantee than checking
 * a caller-supplied id against the actor's.
 *
 * The user must already exist. Inviting someone who has never signed in is a
 * different operation with a different shape (a token, an email, an expiry),
 * and conflating the two is how you end up with membership rows that confer
 * access to an address nobody has proved they control.
 */
export async function addMember(
  ctx: ServiceContext,
  input: AddMemberInput,
): Promise<Member> {
  assertBusinessAdmin(ctx.actor);
  const businessId = ctx.actor.businessId;

  const user = await ctx.db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    throw new NotFoundError("No such user");
  }

  try {
    const membership = await ctx.db.membership.create({
      data: { businessId, userId: input.userId, role: input.role },
      select: { id: true, userId: true, role: true, createdAt: true },
    });
    return { ...membership, email: user.email, name: user.name };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Unique on (userId, businessId). Changing an existing member's role is
      // a separate operation, so this does not quietly become an upsert.
      throw new ConflictError("That user is already a member of this business");
    }
    throw error;
  }
}

/**
 * The caller's own business's staff.
 *
 * Requires a *business* actor, not merely a tenant context. An advocate of
 * this business carries the same `businessId` as its reps, so without that
 * distinction a customer could enumerate the sales team.
 */
export async function listMembers(ctx: ServiceContext): Promise<Member[]> {
  assertBusinessActor(ctx.actor);

  const memberships = await ctx.db.membership.findMany({
    where: { businessId: ctx.actor.businessId },
    select: {
      id: true,
      userId: true,
      role: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return memberships.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    email: m.user.email,
    name: m.user.name,
    createdAt: m.createdAt,
  }));
}
