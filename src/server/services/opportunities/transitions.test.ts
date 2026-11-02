import { describe, expect, it } from "vitest";
import type { OpportunityStatus } from "@/generated/prisma/enums";
import { approvalPolicyFromBusiness, type Actor } from "@/server/context";
import {
  canTransition,
  isLegalTransition,
  isTerminal,
  nextStatuses,
} from "./transitions";

/**
 * Invariant 3 and invariant 4, checked exhaustively rather than sampled.
 *
 * The allowed set below is written out longhand as an independent
 * specification. It would be easy — and worthless — to derive expectations
 * from the same table the implementation uses; then the test would only prove
 * the code equals itself. Every one of the 8 × 8 × 6 × 2 combinations is
 * asserted against this list, so an edge quietly added to the implementation
 * fails here until it is added here too, deliberately.
 */

const STATUSES: OpportunityStatus[] = [
  "PENDING_APPROVAL",
  "REQUESTED",
  "ACCEPTED",
  "COMPLETED",
  "VERIFIED",
  "REWARDED",
  "DECLINED",
  "CANCELLED",
];

const BUSINESS = "01930000-0000-7000-8000-00000000000b";

const actors = {
  admin: {
    kind: "business",
    userId: "u-admin",
    businessId: BUSINESS,
    role: "BUSINESS_ADMIN",
  },
  repCreator: { kind: "business", userId: "u-rep1", businessId: BUSINESS, role: "REP" },
  repOther: { kind: "business", userId: "u-rep2", businessId: BUSINESS, role: "REP" },
  advocateAssigned: {
    kind: "advocate",
    userId: "u-adv1",
    businessId: BUSINESS,
    advocateId: "a-1",
  },
  advocateOther: {
    kind: "advocate",
    userId: "u-adv2",
    businessId: BUSINESS,
    advocateId: "a-2",
  },
  staff: { kind: "platform_staff", userId: "u-staff" },
} satisfies Record<string, Actor>;

type Who = keyof typeof actors;
const WHO = Object.keys(actors) as Who[];

/** Ownership is a property of the actor, not of the call. */
const ownership: Record<Who, { isCreator: boolean; isAssignedAdvocate: boolean }> = {
  admin: { isCreator: false, isAssignedAdvocate: false },
  repCreator: { isCreator: true, isAssignedAdvocate: false },
  repOther: { isCreator: false, isAssignedAdvocate: false },
  advocateAssigned: { isCreator: false, isAssignedAdvocate: true },
  advocateOther: { isCreator: false, isAssignedAdvocate: false },
  staff: { isCreator: false, isAssignedAdvocate: false },
};

const strict = approvalPolicyFromBusiness({
  requireAdminApprovalForOpportunities: true,
  requireAdminApprovalForRewards: true,
});
const delegated = approvalPolicyFromBusiness({
  requireAdminApprovalForOpportunities: false,
  requireAdminApprovalForRewards: false,
});

/** from → to → who may, with admin sign-off required for everything. */
const ALLOWED_STRICT: Partial<
  Record<OpportunityStatus, Partial<Record<OpportunityStatus, Who[]>>>
> = {
  PENDING_APPROVAL: {
    REQUESTED: ["admin"],
    CANCELLED: ["admin", "repCreator"],
  },
  REQUESTED: {
    ACCEPTED: ["advocateAssigned"],
    DECLINED: ["advocateAssigned"],
    CANCELLED: ["admin", "repCreator"],
  },
  ACCEPTED: {
    COMPLETED: ["advocateAssigned"],
    DECLINED: ["advocateAssigned"],
    CANCELLED: ["admin", "repCreator"],
  },
  COMPLETED: {
    VERIFIED: ["admin"],
    CANCELLED: ["admin", "repCreator"],
  },
  VERIFIED: {
    REWARDED: ["admin"],
    CANCELLED: ["admin"],
  },
};

/** The same, with both decisions delegated to reps. */
const ALLOWED_DELEGATED: typeof ALLOWED_STRICT = {
  ...ALLOWED_STRICT,
  PENDING_APPROVAL: {
    REQUESTED: ["admin", "repCreator", "repOther"],
    CANCELLED: ["admin", "repCreator"],
  },
  COMPLETED: {
    VERIFIED: ["admin", "repCreator", "repOther"],
    CANCELLED: ["admin", "repCreator"],
  },
  VERIFIED: {
    REWARDED: ["admin", "repCreator", "repOther"],
    CANCELLED: ["admin"],
  },
};

function check(label: string, policy: typeof strict, allowed: typeof ALLOWED_STRICT) {
  describe(label, () => {
    it("permits exactly the specified combinations and nothing else", () => {
      const wrong: string[] = [];

      for (const from of STATUSES) {
        for (const to of STATUSES) {
          for (const who of WHO) {
            const expected = allowed[from]?.[to]?.includes(who) ?? false;
            const actual = canTransition({
              from,
              to,
              actor: actors[who],
              policy,
              ...ownership[who],
            });
            if (actual !== expected) {
              wrong.push(
                `${from}→${to} as ${who}: expected ${expected}, got ${actual}`,
              );
            }
          }
        }
      }

      expect(wrong).toEqual([]);
    });
  });
}

check("strict policy", strict, ALLOWED_STRICT);
check("delegated policy", delegated, ALLOWED_DELEGATED);

describe("the policy only ever widens a rep, never an advocate or staff", () => {
  it.each(["advocateAssigned", "advocateOther", "staff"] as Who[])(
    "%s gets nothing extra when the business delegates",
    (who) => {
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          const underStrict = canTransition({
            from,
            to,
            actor: actors[who],
            policy: strict,
            ...ownership[who],
          });
          const underDelegated = canTransition({
            from,
            to,
            actor: actors[who],
            policy: delegated,
            ...ownership[who],
          });
          expect(underDelegated, `${from}→${to} as ${who}`).toBe(underStrict);
        }
      }
    },
  );
});

describe("platform staff can make no transition at all", () => {
  it("is refused everywhere, under either policy", () => {
    for (const policy of [strict, delegated]) {
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          expect(
            canTransition({
              from,
              to,
              actor: actors.staff,
              policy,
              isCreator: false,
              isAssignedAdvocate: false,
            }),
            `${from}→${to}`,
          ).toBe(false);
        }
      }
    }
  });

  it("gets nothing even if ownership flags are forced true", () => {
    // Belt and braces: a caller computing ownership wrongly must not hand
    // staff a business-scoped power, since staff hold no businessId at all.
    expect(
      canTransition({
        from: "VERIFIED",
        to: "REWARDED",
        actor: actors.staff,
        policy: delegated,
        isCreator: true,
        isAssignedAdvocate: true,
      }),
    ).toBe(false);
  });
});

describe("an advocate cannot act on someone else's opportunity", () => {
  it.each([
    ["REQUESTED", "ACCEPTED"],
    ["REQUESTED", "DECLINED"],
    ["ACCEPTED", "COMPLETED"],
  ] as const)("%s→%s is refused when unassigned", (from, to) => {
    expect(
      canTransition({
        from,
        to,
        actor: actors.advocateOther,
        policy: delegated,
        isCreator: false,
        isAssignedAdvocate: false,
      }),
    ).toBe(false);
  });
});

describe("the graph itself", () => {
  it("treats REWARDED, DECLINED and CANCELLED as terminal", () => {
    expect(isTerminal("REWARDED")).toBe(true);
    expect(isTerminal("DECLINED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
  });

  it("treats every other status as live", () => {
    for (const s of [
      "PENDING_APPROVAL",
      "REQUESTED",
      "ACCEPTED",
      "COMPLETED",
      "VERIFIED",
    ] as const) {
      expect(isTerminal(s), s).toBe(false);
    }
  });

  it("has no self-edges", () => {
    for (const s of STATUSES) {
      expect(isLegalTransition(s, s), s).toBe(false);
    }
  });

  it("never goes backwards along the happy path", () => {
    const path: OpportunityStatus[] = [
      "PENDING_APPROVAL",
      "REQUESTED",
      "ACCEPTED",
      "COMPLETED",
      "VERIFIED",
      "REWARDED",
    ];
    for (let i = 0; i < path.length; i++) {
      for (let j = 0; j <= i; j++) {
        expect(isLegalTransition(path[i]!, path[j]!), `${path[i]}→${path[j]}`).toBe(
          false,
        );
      }
    }
  });

  it("can reach REWARDED only from VERIFIED", () => {
    const sources = STATUSES.filter((s) => isLegalTransition(s, "REWARDED"));
    expect(sources).toEqual(["VERIFIED"]);
  });

  it("offers the advocate a way out of every state they hold", () => {
    expect(nextStatuses("REQUESTED")).toContain("DECLINED");
    expect(nextStatuses("ACCEPTED")).toContain("DECLINED");
  });
});
