import type { OpportunityStatus } from "@/generated/prisma/enums";
import { approvalPolicyFromBusiness, type Actor } from "@/server/context";
import { canTransition } from "./transitions";

/**
 * What an advocate can do to a quest, and the status each means.
 *
 * The advocate's half of the closed verb set — see `BUSINESS_VERBS` for the
 * other. The browser names a verb; the server maps it. An advocate's form
 * therefore has no way to ask for `REWARDED`, which is the transition that
 * pays them.
 *
 * Moved here from the advocate server action so the page and the action read
 * the same map, and so the buttons can be derived like the business side's.
 */
export const ADVOCATE_VERBS = {
  accept: "ACCEPTED",
  complete: "COMPLETED",
  decline: "DECLINED",
} as const satisfies Record<string, OpportunityStatus>;

export type AdvocateVerb = keyof typeof ADVOCATE_VERBS;

export function isAdvocateVerb(value: string): value is AdvocateVerb {
  return Object.hasOwn(ADVOCATE_VERBS, value);
}

/**
 * The verbs this advocate may use on this quest now, in display order.
 *
 * Derived from `canTransition`, so the advocate page and the state machine
 * cannot disagree. This decides only what to offer; the service decides what
 * happens.
 */
/**
 * The policy passed to `canTransition` on the advocate's behalf.
 *
 * No advocate edge reads the approval policy — accepting, declining and
 * completing are the advocate's own business whatever the company's settings —
 * and an advocate cannot read the policy anyway (`getApprovalPolicy` is staff
 * only). The strictest one is used so that if an advocate edge ever did consult
 * it, the effect could only be to offer less.
 */
const STRICTEST = approvalPolicyFromBusiness({
  requireAdminApprovalForOpportunities: true,
  requireAdminApprovalForRewards: true,
});

export function availableAdvocateVerbs(input: {
  readonly status: OpportunityStatus;
  readonly actor: Actor;
  /** The quest is assigned to this advocate. */
  readonly isAssigned: boolean;
}): AdvocateVerb[] {
  return (Object.keys(ADVOCATE_VERBS) as AdvocateVerb[]).filter((verb) =>
    canTransition({
      from: input.status,
      to: ADVOCATE_VERBS[verb],
      actor: input.actor,
      policy: STRICTEST,
      isCreator: false,
      isAssignedAdvocate: input.isAssigned,
    }),
  );
}
