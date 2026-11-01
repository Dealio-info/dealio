import type { MembershipRole } from "@/generated/prisma/enums";
import type { Db } from "./db";

/**
 * Who is acting, and what they are allowed to do.
 *
 * Every service function takes a `TenantContext` as its first argument and
 * scopes every query by `context.businessId`. Authority is decided here and in
 * the services — never by the caller, and never from request data.
 *
 * Note this module imports `MembershipRole` as a **type only**. That is
 * deliberate and is the one thing the database-import boundary permits outside
 * `db.ts` and the services: types are erased at compile time and cannot reach
 * the database, so sharing them stops these unions being hand-duplicated.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Services throw these rather than returning error shapes, so a missed check
 * fails loudly instead of falling through. The HTTP boundary maps `code` to a
 * status; nothing else should branch on the message.
 */
export class ServiceError extends Error {
  constructor(
    readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** No identified user at all. */
export class UnauthenticatedError extends ServiceError {
  constructor(message = "Not signed in") {
    super("UNAUTHENTICATED", message);
  }
}

/** Identified, but not permitted — including every cross-tenant attempt. */
export class ForbiddenError extends ServiceError {
  constructor(message = "Not permitted") {
    super("FORBIDDEN", message);
  }
}

/**
 * Also used where a record exists but belongs to another business and saying
 * "forbidden" would itself leak that it exists.
 */
export class NotFoundError extends ServiceError {
  constructor(message = "Not found") {
    super("NOT_FOUND", message);
  }
}

/** A valid request that conflicts with current state. */
export class ConflictError extends ServiceError {
  constructor(message = "Conflict") {
    super("CONFLICT", message);
  }
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

/** A member of a business's staff. */
export type BusinessActor = {
  readonly kind: "business";
  readonly userId: string;
  readonly businessId: string;
  readonly role: MembershipRole;
};

/**
 * A customer of a business, acting through their `Advocate` record. Advocates
 * are not `Membership`s — they are the business's customers, not its staff.
 */
export type AdvocateActor = {
  readonly kind: "advocate";
  readonly userId: string;
  readonly businessId: string;
  readonly advocateId: string;
};

/**
 * Dealio's own staff. Carries no `businessId`, because it confers no
 * business-scoped access. Keeping it out of `TenantContext` at the type level
 * is what makes the prototype's worst defect — staff and customer admins
 * sharing one flag — unrepresentable here.
 */
export type PlatformStaffActor = {
  readonly kind: "platform_staff";
  readonly userId: string;
};

export type Actor = BusinessActor | AdvocateActor | PlatformStaffActor;

/** An actor scoped to exactly one business. Always has a `businessId`. */
export type TenantContext = BusinessActor | AdvocateActor;

export function isTenantContext(actor: Actor): actor is TenantContext {
  return actor.kind === "business" || actor.kind === "advocate";
}

/** Narrow to a tenant-scoped actor, or refuse. */
export function requireTenantContext(actor: Actor): TenantContext {
  if (!isTenantContext(actor)) {
    throw new ForbiddenError("This action requires a business or advocate context");
  }
  return actor;
}

export function isBusinessAdmin(actor: Actor): boolean {
  return actor.kind === "business" && actor.role === "BUSINESS_ADMIN";
}

/**
 * Narrow to a member of a business's staff — admin or rep — or refuse.
 *
 * Distinct from `assertBusinessAdmin`, which is about rank, and from
 * `requireTenantContext`, which admits advocates. An advocate carries the same
 * `businessId` as that business's reps, so for anything that exposes the
 * business's own side of the product — the staff list, the policy, the
 * dashboard — being tenant-scoped is not enough.
 */
export function assertBusinessActor(actor: Actor): asserts actor is BusinessActor {
  if (actor.kind !== "business") {
    throw new ForbiddenError("This action requires a business team member");
  }
}

export function assertBusinessAdmin(actor: Actor): asserts actor is BusinessActor {
  if (!isBusinessAdmin(actor)) {
    throw new ForbiddenError("This action requires a business admin");
  }
}

/**
 * The cross-tenant guard. Call it on every record loaded by id before acting on
 * it — a service that filters by `businessId` in its `where` clause does not
 * need it, but one that takes an id from the caller does.
 */
export function assertSameBusiness(
  context: TenantContext,
  record: { readonly businessId: string },
): void {
  if (record.businessId !== context.businessId) {
    throw new ForbiddenError("Record belongs to another business");
  }
}

// ---------------------------------------------------------------------------
// Approval policy (invariant 4)
// ---------------------------------------------------------------------------

declare const approvalPolicyBrand: unique symbol;

/**
 * Whether a rep may act without admin sign-off. Branded so it cannot be built
 * from an object literal: the only way to obtain one is
 * `approvalPolicyFromBusiness`, which takes a `Business` row.
 *
 * This does not make invariant 4 airtight — someone could hand the factory a
 * request body — but it makes the correct path the easy one and the wrong path
 * conspicuous in review, which is the most a type can do here.
 */
export type ApprovalPolicy = {
  readonly requireAdminApprovalForOpportunities: boolean;
  readonly requireAdminApprovalForRewards: boolean;
  readonly [approvalPolicyBrand]: true;
};

/** Build the policy from a `Business` row. Read it inside the transaction. */
export function approvalPolicyFromBusiness(business: {
  readonly requireAdminApprovalForOpportunities: boolean;
  readonly requireAdminApprovalForRewards: boolean;
}): ApprovalPolicy {
  return {
    requireAdminApprovalForOpportunities: business.requireAdminApprovalForOpportunities,
    requireAdminApprovalForRewards: business.requireAdminApprovalForRewards,
  } as ApprovalPolicy;
}

/**
 * May this actor send an opportunity to an advocate without admin sign-off?
 *
 * Admins always may. Reps may only where the business has delegated it.
 * Advocates and platform staff never may — a permissive policy loosens what a
 * rep can do and must not leak authority to the advocate, who is the one
 * receiving the currency.
 */
export function canPublishOpportunity(actor: Actor, policy: ApprovalPolicy): boolean {
  if (actor.kind !== "business") return false;
  if (actor.role === "BUSINESS_ADMIN") return true;
  return !policy.requireAdminApprovalForOpportunities;
}

/** May this actor move an opportunity to `REWARDED`, crediting the advocate? */
export function canRewardOpportunity(actor: Actor, policy: ApprovalPolicy): boolean {
  if (actor.kind !== "business") return false;
  if (actor.role === "BUSINESS_ADMIN") return true;
  return !policy.requireAdminApprovalForRewards;
}

// ---------------------------------------------------------------------------
// Identity → Actor
// ---------------------------------------------------------------------------

/**
 * Everything the database knows about one signed-in human: their `User` row,
 * whether they are Dealio staff, and every business they are staff of or an
 * advocate for.
 *
 * This is deliberately a set rather than a single resolved actor. One person
 * can legitimately be a rep at one business and a customer-advocate of
 * another, and `Membership` allows several businesses per user. Collapsing
 * that to one "current" actor would mean guessing a tenant, which is precisely
 * the class of bug this architecture exists to prevent — so the caller names
 * the business it means and gets a context for that one or an error.
 */
export type Identity = {
  readonly user: { readonly id: string; readonly email: string };
  readonly isPlatformStaff: boolean;
  readonly memberships: ReadonlyArray<{
    readonly businessId: string;
    readonly role: MembershipRole;
  }>;
  readonly advocates: ReadonlyArray<{
    readonly advocateId: string;
    readonly businessId: string;
  }>;
};

/** A staff context for one named business, or an error. */
export function businessActor(identity: Identity, businessId: string): BusinessActor {
  const membership = identity.memberships.find((m) => m.businessId === businessId);
  if (!membership) {
    throw new ForbiddenError("Not a member of this business");
  }
  return {
    kind: "business",
    userId: identity.user.id,
    businessId,
    role: membership.role,
  };
}

/** An advocate context for one named business, or an error. */
export function advocateActor(identity: Identity, businessId: string): AdvocateActor {
  const advocate = identity.advocates.find((a) => a.businessId === businessId);
  if (!advocate) {
    throw new ForbiddenError("Not an advocate of this business");
  }
  return {
    kind: "advocate",
    userId: identity.user.id,
    businessId,
    advocateId: advocate.advocateId,
  };
}

export function platformStaffActor(identity: Identity): PlatformStaffActor {
  if (!identity.isPlatformStaff) {
    throw new ForbiddenError("Not platform staff");
  }
  return { kind: "platform_staff", userId: identity.user.id };
}

/**
 * The convenience path for the common case: a user belonging to exactly one
 * business, in exactly one capacity.
 *
 * Refuses when the answer is ambiguous rather than picking the first match.
 * Guessing here would silently act on the wrong tenant, and a user with two
 * memberships is a perfectly ordinary thing for a pilot to produce.
 */
export function soleTenantContext(identity: Identity): TenantContext {
  const total = identity.memberships.length + identity.advocates.length;
  if (total === 0) {
    throw new ForbiddenError("This account belongs to no business");
  }
  if (total > 1) {
    throw new ForbiddenError(
      "This account belongs to more than one business; the business must be specified",
    );
  }
  const [membership] = identity.memberships;
  if (membership) {
    return businessActor(identity, membership.businessId);
  }
  const [advocate] = identity.advocates;
  // Unreachable: total is 1 and there was no membership.
  if (!advocate) throw new ForbiddenError("This account belongs to no business");
  return advocateActor(identity, advocate.businessId);
}

// ---------------------------------------------------------------------------
// Service context
// ---------------------------------------------------------------------------

/**
 * What every tenant-scoped service function takes as its first argument: the
 * database handle to run on, and who is acting.
 *
 * The handle is explicit rather than implicit so a service can be composed into
 * a caller's transaction — `prisma.$transaction((tx) => doThing({ db: tx,
 * actor }, input))`. Invariant 1 depends on that: a currency movement and the
 * ledger row recording it have to be atomic.
 *
 * `actor` is a `TenantContext`, so it always carries a `businessId`. Scope
 * every query by `actor.businessId`, and never take a business id from the
 * caller's input.
 */
export type ServiceContext = {
  readonly db: Db;
  readonly actor: TenantContext;
};

/** For the few operations that are Dealio staff's rather than a customer's. */
export type PlatformServiceContext = {
  readonly db: Db;
  readonly actor: PlatformStaffActor;
};
