import { describe, expect, it } from "vitest";
import type { OpportunityStatus } from "@/generated/prisma/enums";
import { approvalPolicyFromBusiness, type Actor } from "@/server/context";
import {
  BUSINESS_VERBS,
  availableVerbs,
  isBusinessVerb,
  type BusinessVerb,
} from "./business-verbs";
import { canTransition } from "./transitions";

const strict = approvalPolicyFromBusiness({
  requireAdminApprovalForOpportunities: true,
  requireAdminApprovalForRewards: true,
});
const delegated = approvalPolicyFromBusiness({
  requireAdminApprovalForOpportunities: false,
  requireAdminApprovalForRewards: false,
});
const admin: Actor = {
  kind: "business",
  userId: "a",
  businessId: "b",
  role: "BUSINESS_ADMIN",
};
const rep: Actor = { kind: "business", userId: "r", businessId: "b", role: "REP" };

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

describe("BUSINESS_VERBS", () => {
  it("never maps to a status that is the advocate's to set", () => {
    const advocateOnly: OpportunityStatus[] = ["ACCEPTED", "COMPLETED", "DECLINED"];
    for (const status of Object.values(BUSINESS_VERBS)) {
      expect(advocateOnly).not.toContain(status);
    }
  });

  it("recognises only its own verbs", () => {
    expect(isBusinessVerb("send")).toBe(true);
    for (const v of ["REWARDED", "accept", "toString", "__proto__", ""]) {
      expect(isBusinessVerb(v), v).toBe(false);
    }
  });
});

describe("availableVerbs", () => {
  // Written out by hand, independently of the derivation, so a change to the
  // state machine shows up here as a visible difference in what is offered.
  const cases: Array<
    [string, Actor, typeof strict, boolean, OpportunityStatus, BusinessVerb[]]
  > = [
    ["admin drafts", admin, strict, false, "PENDING_APPROVAL", ["send", "cancel"]],
    ["strict rep's own draft", rep, strict, true, "PENDING_APPROVAL", ["cancel"]],
    ["strict rep, someone else's draft", rep, strict, false, "PENDING_APPROVAL", []],
    [
      "delegated rep's own draft",
      rep,
      delegated,
      true,
      "PENDING_APPROVAL",
      ["send", "cancel"],
    ],
    ["admin, sent", admin, strict, false, "REQUESTED", ["cancel"]],
    ["admin, accepted", admin, strict, false, "ACCEPTED", ["cancel"]],
    ["admin, done", admin, strict, false, "COMPLETED", ["verify", "cancel"]],
    ["strict rep, done", rep, strict, true, "COMPLETED", ["cancel"]],
    ["delegated rep, done", rep, delegated, true, "COMPLETED", ["verify", "cancel"]],
    ["admin, verified", admin, strict, false, "VERIFIED", ["award", "cancel"]],
    ["delegated rep, verified", rep, delegated, true, "VERIFIED", ["award"]],
    ["admin, rewarded", admin, strict, false, "REWARDED", []],
    ["admin, declined", admin, strict, false, "DECLINED", []],
    ["admin, cancelled", admin, strict, false, "CANCELLED", []],
  ];

  for (const [label, actor, policy, isCreator, status, expected] of cases) {
    it(label, () => {
      expect(availableVerbs({ status, actor, policy, isCreator })).toEqual(expected);
    });
  }

  it("offers exactly what canTransition allows, everywhere", () => {
    for (const status of STATUSES)
      for (const actor of [admin, rep])
        for (const policy of [strict, delegated])
          for (const isCreator of [true, false]) {
            const offered = new Set(
              availableVerbs({ status, actor, policy, isCreator }),
            );
            for (const verb of Object.keys(BUSINESS_VERBS) as BusinessVerb[]) {
              const allowed = canTransition({
                from: status,
                to: BUSINESS_VERBS[verb],
                actor,
                policy,
                isCreator,
                isAssignedAdvocate: false,
              });
              expect(offered.has(verb), `${status} ${actor.kind} ${verb}`).toBe(
                allowed,
              );
            }
          }
  });
});
