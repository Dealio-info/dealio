import type { OpportunityStatus } from "@/generated/prisma/enums";
import type { Actor, ApprovalPolicy } from "@/server/context";
import { canTransition } from "./transitions";

/**
 * What the business side can do to a quest, and the status each means.
 *
 * A closed set, like the advocate side's `accept | decline | complete`: the
 * browser names a verb and the server maps it, so no form can ask for a target
 * status — `ACCEPTED`, say, which belongs to the advocate. The state machine
 * would refuse it; the narrower surface means there is nothing to refuse.
 */
export const BUSINESS_VERBS = {
  send: "REQUESTED",
  verify: "VERIFIED",
  award: "REWARDED",
  cancel: "CANCELLED",
} as const satisfies Record<string, OpportunityStatus>;

export type BusinessVerb = keyof typeof BUSINESS_VERBS;

export function isBusinessVerb(value: string): value is BusinessVerb {
  return Object.hasOwn(BUSINESS_VERBS, value);
}

/**
 * The verbs this person may use on this quest right now, in display order.
 *
 * Derived from `canTransition` rather than restated, so the buttons a page
 * shows and the transitions the service allows come from the same table and
 * cannot disagree. This only decides what to *offer*: the service re-checks
 * everything, with the policy read inside its own transaction.
 */
export function availableVerbs(input: {
  readonly status: OpportunityStatus;
  readonly actor: Actor;
  readonly policy: ApprovalPolicy;
  readonly isCreator: boolean;
}): BusinessVerb[] {
  return (Object.keys(BUSINESS_VERBS) as BusinessVerb[]).filter((verb) =>
    canTransition({
      from: input.status,
      to: BUSINESS_VERBS[verb],
      actor: input.actor,
      policy: input.policy,
      isCreator: input.isCreator,
      // Business staff are never the assigned advocate. Passing true here
      // could only ever widen what is offered.
      isAssignedAdvocate: false,
    }),
  );
}
