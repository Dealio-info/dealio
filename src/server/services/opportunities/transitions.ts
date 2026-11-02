import type { OpportunityStatus } from "@/generated/prisma/enums";
import {
  canPublishOpportunity,
  canRewardOpportunity,
  isBusinessAdmin,
  type Actor,
  type ApprovalPolicy,
} from "@/server/context";

/**
 * The opportunity lifecycle, as data.
 *
 * ```
 * PENDING_APPROVAL → REQUESTED → ACCEPTED → COMPLETED → VERIFIED → REWARDED
 * ```
 *
 * with `DECLINED` and `CANCELLED` as terminal exits. Invariant 3: every
 * mutation goes through `canTransition`, and nothing writes a status directly.
 *
 * Pure and policy-parameterised on purpose. The per-business approval setting
 * then costs nothing — the matrix is data rather than branching scattered
 * through handlers — and the whole thing is testable without a database, which
 * is how it can be checked exhaustively rather than sampled.
 *
 * Two separate ownership flags rather than one "is it theirs". A business user
 * owning an opportunity (they created it) and an advocate owning one (it is
 * assigned to them) are different relationships that happen to share a word,
 * and collapsing them into a single boolean is how an advocate ends up passing
 * a check written for a rep.
 */

export type TransitionRequest = {
  readonly from: OpportunityStatus;
  readonly to: OpportunityStatus;
  readonly actor: Actor;
  /** Read from the `Business` row, never from the caller — invariant 4. */
  readonly policy: ApprovalPolicy;
  /** The actor is the business user who created this opportunity. */
  readonly isCreator: boolean;
  /** The actor is the advocate this opportunity is assigned to. */
  readonly isAssignedAdvocate: boolean;
};

type Guard = (req: TransitionRequest) => boolean;

/** The advocate it was sent to, and nobody else. */
const assignedAdvocate: Guard = (req) =>
  req.actor.kind === "advocate" && req.isAssignedAdvocate;

/**
 * Sending it to the advocate. Admins always may; a rep only where the business
 * has delegated that, which is the `requireAdminApprovalForOpportunities` flag.
 */
const mayPublish: Guard = (req) => canPublishOpportunity(req.actor, req.policy);

/**
 * Verifying and rewarding share a guard, deliberately. Verification is the
 * factual assertion that justifies the payout, so letting a rep verify while
 * reserving the reward for an admin would be a distinction without a
 * difference — the admin would be rubber-stamping someone else's finding.
 */
const mayReward: Guard = (req) => canRewardOpportunity(req.actor, req.policy);

/** An admin, or the rep whose opportunity it is. */
const adminOrCreator: Guard = (req) =>
  isBusinessAdmin(req.actor) || (req.actor.kind === "business" && req.isCreator);

const adminOnly: Guard = (req) => isBusinessAdmin(req.actor);

/**
 * Every legal edge, with who may walk it. An edge absent from here does not
 * exist — there is no default-allow.
 */
const EDGES: ReadonlyArray<{
  readonly from: OpportunityStatus;
  readonly to: OpportunityStatus;
  readonly guard: Guard;
}> = [
  // Waiting for sign-off before the advocate ever sees it.
  { from: "PENDING_APPROVAL", to: "REQUESTED", guard: mayPublish },
  { from: "PENDING_APPROVAL", to: "CANCELLED", guard: adminOrCreator },

  // With the advocate.
  { from: "REQUESTED", to: "ACCEPTED", guard: assignedAdvocate },
  { from: "REQUESTED", to: "DECLINED", guard: assignedAdvocate },
  { from: "REQUESTED", to: "CANCELLED", guard: adminOrCreator },

  // Accepted but not yet done. An advocate who said yes and then cannot
  // deliver needs a way to say so; silently stalling is worse.
  { from: "ACCEPTED", to: "COMPLETED", guard: assignedAdvocate },
  { from: "ACCEPTED", to: "DECLINED", guard: assignedAdvocate },
  { from: "ACCEPTED", to: "CANCELLED", guard: adminOrCreator },

  // The advocate says it happened; the business confirms it.
  { from: "COMPLETED", to: "VERIFIED", guard: mayReward },
  { from: "COMPLETED", to: "CANCELLED", guard: adminOrCreator },

  // Verified and payable. Currency moves on REWARDED (Task 8).
  { from: "VERIFIED", to: "REWARDED", guard: mayReward },
  // The last clean exit: no currency has moved yet, so a duplicate or a
  // mistake can still be closed out. Admin only, because by this point the
  // business has already agreed the work was done. After REWARDED the only
  // correction is an appended ledger adjustment, never a status change.
  { from: "VERIFIED", to: "CANCELLED", guard: adminOnly },

  // REWARDED, DECLINED and CANCELLED are terminal. No edges leave them.
];

/** Does this edge exist at all, ignoring who is asking? */
export function isLegalTransition(
  from: OpportunityStatus,
  to: OpportunityStatus,
): boolean {
  return EDGES.some((e) => e.from === from && e.to === to);
}

/** Every status reachable from here, ignoring authority. For UI affordances. */
export function nextStatuses(from: OpportunityStatus): OpportunityStatus[] {
  return EDGES.filter((e) => e.from === from).map((e) => e.to);
}

export function isTerminal(status: OpportunityStatus): boolean {
  return nextStatuses(status).length === 0;
}

/**
 * May this actor make this transition?
 *
 * A single answer covering both "is this edge real" and "are you allowed",
 * because a caller that can tell the difference can also leak it. Services
 * distinguish the two for error messages by also calling `isLegalTransition`.
 */
export function canTransition(req: TransitionRequest): boolean {
  const edge = EDGES.find((e) => e.from === req.from && e.to === req.to);
  if (!edge) return false;
  return edge.guard(req);
}
