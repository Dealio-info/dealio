import { describe, expect, it } from "vitest";
import {
  ForbiddenError,
  approvalPolicyFromBusiness,
  assertBusinessActor,
  assertBusinessAdmin,
  assertSameBusiness,
  canPublishOpportunity,
  canRewardOpportunity,
  isBusinessAdmin,
  requireTenantContext,
  advocateActor,
  businessActor,
  platformStaffActor,
  soleBusinessActor,
  soleTenantContext,
  type Actor,
} from "./context";

/**
 * Authority lives here and is pure, so it can be tested exhaustively without a
 * database. Invariant 4 is the one these tests exist for: whether a rep may
 * publish an opportunity or award currency is a per-business setting, and a
 * caller must not be able to widen their own authority.
 */

const BUSINESS = "01930000-0000-7000-8000-00000000000b";
const OTHER_BUSINESS = "01930000-0000-7000-8000-00000000000c";

const admin: Actor = {
  kind: "business",
  userId: "u-admin",
  businessId: BUSINESS,
  role: "BUSINESS_ADMIN",
};
const rep: Actor = {
  kind: "business",
  userId: "u-rep",
  businessId: BUSINESS,
  role: "REP",
};
const advocate: Actor = {
  kind: "advocate",
  userId: "u-adv",
  businessId: BUSINESS,
  advocateId: "a-1",
};
const staff: Actor = { kind: "platform_staff", userId: "u-staff" };

const strict = approvalPolicyFromBusiness({
  requireAdminApprovalForOpportunities: true,
  requireAdminApprovalForRewards: true,
});
const delegated = approvalPolicyFromBusiness({
  requireAdminApprovalForOpportunities: false,
  requireAdminApprovalForRewards: false,
});

describe("requireTenantContext", () => {
  it("passes through business and advocate actors", () => {
    expect(requireTenantContext(admin).businessId).toBe(BUSINESS);
    expect(requireTenantContext(advocate).businessId).toBe(BUSINESS);
  });

  it("rejects platform staff, who have no business scope", () => {
    // Platform staff is deliberately not a tenant actor. Staff operations take
    // their own context so staff access can never be mistaken for a customer's.
    expect(() => requireTenantContext(staff)).toThrow(ForbiddenError);
  });
});

describe("assertSameBusiness", () => {
  it("accepts a record belonging to the actor's business", () => {
    expect(() => assertSameBusiness(admin, { businessId: BUSINESS })).not.toThrow();
  });

  it("rejects a record from another business", () => {
    expect(() => assertSameBusiness(admin, { businessId: OTHER_BUSINESS })).toThrow(
      ForbiddenError,
    );
  });

  it("rejects for an advocate too, not just staff roles", () => {
    expect(() => assertSameBusiness(advocate, { businessId: OTHER_BUSINESS })).toThrow(
      ForbiddenError,
    );
  });
});

describe("isBusinessAdmin / assertBusinessAdmin", () => {
  it("is true only for a business admin", () => {
    expect(isBusinessAdmin(admin)).toBe(true);
    expect(isBusinessAdmin(rep)).toBe(false);
    expect(isBusinessAdmin(advocate)).toBe(false);
    expect(isBusinessAdmin(staff)).toBe(false);
  });

  it("narrows on success and throws otherwise", () => {
    expect(() => assertBusinessAdmin(admin)).not.toThrow();
    expect(() => assertBusinessAdmin(rep)).toThrow(ForbiddenError);
    expect(() => assertBusinessAdmin(advocate)).toThrow(ForbiddenError);
    expect(() => assertBusinessAdmin(staff)).toThrow(ForbiddenError);
  });
});

describe("assertBusinessActor", () => {
  it("passes an admin and a rep", () => {
    expect(() => assertBusinessActor(admin)).not.toThrow();
    expect(() => assertBusinessActor(rep)).not.toThrow();
  });

  it("refuses an advocate", () => {
    // An advocate is the business's customer, not its staff. They share a
    // businessId with the reps, so nothing but this check stops an advocate
    // reading the staff list.
    expect(() => assertBusinessActor(advocate)).toThrow(ForbiddenError);
  });

  it("refuses platform staff", () => {
    expect(() => assertBusinessActor(staff)).toThrow(ForbiddenError);
  });
});

describe("approval policy (invariant 4)", () => {
  // Table-driven over every actor and both policies, because a configurable
  // permission rule tested in only one configuration is not tested.
  const cases: Array<{
    actor: Actor;
    label: string;
    strictPublish: boolean;
    delegatedPublish: boolean;
    strictReward: boolean;
    delegatedReward: boolean;
  }> = [
    {
      actor: admin,
      label: "business admin",
      strictPublish: true,
      delegatedPublish: true,
      strictReward: true,
      delegatedReward: true,
    },
    {
      actor: rep,
      label: "rep",
      strictPublish: false,
      delegatedPublish: true,
      strictReward: false,
      delegatedReward: true,
    },
    {
      actor: advocate,
      label: "advocate",
      strictPublish: false,
      delegatedPublish: false,
      strictReward: false,
      delegatedReward: false,
    },
    {
      actor: staff,
      label: "platform staff",
      strictPublish: false,
      delegatedPublish: false,
      strictReward: false,
      delegatedReward: false,
    },
  ];

  for (const c of cases) {
    it(`${c.label}: publishing`, () => {
      expect(canPublishOpportunity(c.actor, strict)).toBe(c.strictPublish);
      expect(canPublishOpportunity(c.actor, delegated)).toBe(c.delegatedPublish);
    });

    it(`${c.label}: rewarding`, () => {
      expect(canRewardOpportunity(c.actor, strict)).toBe(c.strictReward);
      expect(canRewardOpportunity(c.actor, delegated)).toBe(c.delegatedReward);
    });
  }

  it("treats the two flags independently", () => {
    const mixed = approvalPolicyFromBusiness({
      requireAdminApprovalForOpportunities: false,
      requireAdminApprovalForRewards: true,
    });
    expect(canPublishOpportunity(rep, mixed)).toBe(true);
    expect(canRewardOpportunity(rep, mixed)).toBe(false);
  });

  it("an advocate is never granted authority by a permissive policy", () => {
    // The delegated policy loosens what a REP may do. It must not leak
    // authority to the advocate, who is the beneficiary of the currency.
    expect(canPublishOpportunity(advocate, delegated)).toBe(false);
    expect(canRewardOpportunity(advocate, delegated)).toBe(false);
  });
});

describe("ForbiddenError", () => {
  it("carries a stable code for the HTTP boundary to map", () => {
    const error = new ForbiddenError("nope");
    expect(error.code).toBe("FORBIDDEN");
    expect(error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// Identity → Actor selection
// ---------------------------------------------------------------------------

const identity = {
  user: { id: "u-1", email: "person@example.com" },
  isPlatformStaff: false,
  memberships: [{ businessId: BUSINESS, role: "REP" as const }],
  advocates: [],
};

describe("actor selection from an identity", () => {
  it("builds a business actor for a business the user belongs to", () => {
    const actor = businessActor(identity, BUSINESS);
    expect(actor).toEqual({
      kind: "business",
      userId: "u-1",
      businessId: BUSINESS,
      role: "REP",
    });
  });

  it("refuses a business the user does not belong to", () => {
    expect(() => businessActor(identity, OTHER_BUSINESS)).toThrow(ForbiddenError);
  });

  it("refuses an advocate context when there is no advocate record", () => {
    expect(() => advocateActor(identity, BUSINESS)).toThrow(ForbiddenError);
  });

  it("refuses a platform staff context for a non-staff user", () => {
    expect(() => platformStaffActor(identity)).toThrow(ForbiddenError);
  });

  it("keeps the two sides separate for someone who is both", () => {
    // A person can be staff at one business and a customer-advocate of
    // another. Each context must be requested explicitly; neither implies the
    // other.
    const both = {
      ...identity,
      memberships: [{ businessId: BUSINESS, role: "BUSINESS_ADMIN" as const }],
      advocates: [{ advocateId: "a-9", businessId: OTHER_BUSINESS }],
    };
    expect(businessActor(both, BUSINESS).role).toBe("BUSINESS_ADMIN");
    expect(advocateActor(both, OTHER_BUSINESS).advocateId).toBe("a-9");
    expect(() => businessActor(both, OTHER_BUSINESS)).toThrow(ForbiddenError);
    expect(() => advocateActor(both, BUSINESS)).toThrow(ForbiddenError);
  });
});

describe("soleTenantContext", () => {
  it("returns the only context a user has", () => {
    expect(soleTenantContext(identity).businessId).toBe(BUSINESS);
  });

  it("works for an advocate-only user", () => {
    const advocateOnly = {
      ...identity,
      memberships: [],
      advocates: [{ advocateId: "a-2", businessId: BUSINESS }],
    };
    const ctx = soleTenantContext(advocateOnly);
    expect(ctx.kind).toBe("advocate");
  });

  it("refuses when the user has no tenant context at all", () => {
    expect(() => soleTenantContext({ ...identity, memberships: [] })).toThrow(
      ForbiddenError,
    );
  });

  it("refuses rather than guessing when the choice is ambiguous", () => {
    // Silently picking one would be a cross-tenant bug waiting to happen, so
    // the caller has to say which business it means.
    const ambiguous = {
      ...identity,
      memberships: [
        { businessId: BUSINESS, role: "REP" as const },
        { businessId: OTHER_BUSINESS, role: "REP" as const },
      ],
    };
    expect(() => soleTenantContext(ambiguous)).toThrow(ForbiddenError);
  });

  it("refuses when a user is both staff of one business and advocate of another", () => {
    const mixed = {
      ...identity,
      advocates: [{ advocateId: "a-3", businessId: OTHER_BUSINESS }],
    };
    expect(() => soleTenantContext(mixed)).toThrow(ForbiddenError);
  });
});

describe("soleBusinessActor", () => {
  const base = { user: { id: "u-1", email: "a@b.com" }, isPlatformStaff: false };

  it("returns the only membership", () => {
    const actor = soleBusinessActor({
      ...base,
      memberships: [{ businessId: BUSINESS, role: "REP" }],
      advocates: [],
    });
    expect(actor).toMatchObject({
      kind: "business",
      businessId: BUSINESS,
      role: "REP",
    });
  });

  it("refuses when there is none, and says so", () => {
    expect(() =>
      soleBusinessActor({ ...base, memberships: [], advocates: [] }),
    ).toThrow(/not a member of any business/);
  });

  it("refuses rather than guessing between two", () => {
    expect(() =>
      soleBusinessActor({
        ...base,
        memberships: [
          { businessId: BUSINESS, role: "BUSINESS_ADMIN" },
          { businessId: OTHER_BUSINESS, role: "REP" },
        ],
        advocates: [],
      }),
    ).toThrow(/more than one business/);
  });

  it("ignores advocate records, which are not staff", () => {
    // Being a customer of one company and staff of another is ordinary, and
    // must not make the staff context ambiguous.
    const actor = soleBusinessActor({
      ...base,
      memberships: [{ businessId: BUSINESS, role: "REP" }],
      advocates: [{ advocateId: "a-1", businessId: OTHER_BUSINESS }],
    });
    expect(actor.businessId).toBe(BUSINESS);
  });
});
