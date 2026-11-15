import type { AdvocateStatus } from "@/generated/prisma/enums";
import { assertBusinessActor, type ServiceContext } from "@/server/context";

export type AdvocateSummary = {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly company: string | null;
  readonly title: string | null;
  readonly status: AdvocateStatus;
  /** False while the invite is outstanding. */
  readonly hasClaimed: boolean;
  /** They used an unsubscribe link: this business's emails do not reach them. */
  readonly emailOptedOut: boolean;
  readonly createdAt: Date;
  readonly lastActiveAt: Date | null;
};

/**
 * The caller's own business's advocates.
 *
 * Staff only. An advocate shares a `businessId` with every other advocate of
 * that business, so without `assertBusinessActor` one customer could enumerate
 * the others — names, employers and job titles of a company's reference
 * accounts, which is commercially sensitive quite apart from being private.
 */
export async function listAdvocates(
  ctx: ServiceContext,
  input: { readonly status?: AdvocateStatus } = {},
): Promise<AdvocateSummary[]> {
  assertBusinessActor(ctx.actor);

  const advocates = await ctx.db.advocate.findMany({
    where: {
      businessId: ctx.actor.businessId,
      ...(input.status && { status: input.status }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      company: true,
      title: true,
      status: true,
      userId: true,
      createdAt: true,
      lastActiveAt: true,
      emailOptedOutAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return advocates.map(({ userId, emailOptedOutAt, ...rest }) => ({
    ...rest,
    hasClaimed: userId !== null,
    emailOptedOut: emailOptedOutAt !== null,
  }));
}
