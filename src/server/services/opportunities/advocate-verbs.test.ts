import { describe, expect, it } from "vitest";
import type { OpportunityStatus } from "@/generated/prisma/enums";
import { approvalPolicyFromBusiness, type Actor } from "@/server/context";
import {
  ADVOCATE_VERBS,
  availableAdvocateVerbs,
  isAdvocateVerb,
  type AdvocateVerb,
} from "./advocate-verbs";
import { BUSINESS_VERBS } from "./business-verbs";
import { canTransition } from "./transitions";

const strict = approvalPolicyFromBusiness({
  requireAdminApprovalForOpportunities: true,
  requireAdminApprovalForRewards: true,
});
const advocate: Actor = {
  kind: "advocate",
  userId: "u",
  businessId: "b",
  advocateId: "a",
};

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

describe("ADVOCATE_VERBS", () => {
  it("shares no target status with the business side", () => {
    // The two audiences move a quest through disjoint edges. Overlap would
    // mean one side's form could ask for the other's transition.
    const theirs = new Set<string>(Object.values(BUSINESS_VERBS));
    for (const status of Object.values(ADVOCATE_VERBS)) {
      expect(theirs.has(status), status).toBe(false);
    }
  });

  it("recognises only its own verbs", () => {
    expect(isAdvocateVerb("accept")).toBe(true);
    for (const v of ["REWARDED", "award", "verify", "constructor", ""]) {
      expect(isAdvocateVerb(v), v).toBe(false);
    }
  });
});

describe("availableAdvocateVerbs", () => {
  const cases: Array<[OpportunityStatus, AdvocateVerb[]]> = [
    ["PENDING_APPROVAL", []], // not sent yet — the advocate cannot see it act
    ["REQUESTED", ["accept", "decline"]],
    ["ACCEPTED", ["complete", "decline"]],
    ["COMPLETED", []],
    ["VERIFIED", []],
    ["REWARDED", []],
    ["DECLINED", []],
    ["CANCELLED", []],
  ];
  for (const [status, expected] of cases) {
    it(`${status} → ${expected.join(", ") || "nothing"}`, () => {
      expect(
        availableAdvocateVerbs({ status, actor: advocate, isAssigned: true }),
      ).toEqual(expected);
    });
  }

  it("offers nothing on a quest assigned to someone else", () => {
    for (const status of STATUSES) {
      expect(
        availableAdvocateVerbs({ status, actor: advocate, isAssigned: false }),
      ).toEqual([]);
    }
  });

  it("offers exactly what canTransition allows, under either policy", () => {
    const delegated = approvalPolicyFromBusiness({
      requireAdminApprovalForOpportunities: false,
      requireAdminApprovalForRewards: false,
    });
    for (const policy of [strict, delegated])
      for (const status of STATUSES)
        for (const isAssigned of [true, false]) {
          const offered = new Set(
            availableAdvocateVerbs({ status, actor: advocate, isAssigned }),
          );
          for (const verb of Object.keys(ADVOCATE_VERBS) as AdvocateVerb[]) {
            expect(offered.has(verb), `${status} ${verb}`).toBe(
              canTransition({
                from: status,
                to: ADVOCATE_VERBS[verb],
                actor: advocate,
                policy,
                isCreator: false,
                isAssignedAdvocate: isAssigned,
              }),
            );
          }
        }
  });
});
