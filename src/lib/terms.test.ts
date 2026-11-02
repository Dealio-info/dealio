import { describe, expect, it } from "vitest";
import {
  capitalize,
  countOf,
  OPPORTUNITY_STATUS,
  statusLabel,
  statusRole,
  TERMS,
} from "./terms";

/**
 * The point of these tests is not the strings — it is that renaming a
 * user-facing noun stays a one-line change in `terms.ts`. They assert through
 * `TERMS` rather than against literals so they keep passing when the wording
 * changes, and fail if the pluralisation or capitalisation logic breaks.
 */

describe("countOf", () => {
  it("uses the singular for exactly one", () => {
    expect(countOf(1, TERMS.quest)).toBe(`1 ${TERMS.quest.one}`);
  });

  it("uses the plural for zero and for many", () => {
    expect(countOf(0, TERMS.quest)).toBe(`0 ${TERMS.quest.many}`);
    expect(countOf(4, TERMS.quest)).toBe(`4 ${TERMS.quest.many}`);
  });

  it("groups thousands", () => {
    expect(countOf(2500, TERMS.advocate)).toBe(`2,500 ${TERMS.advocate.many}`);
  });
});

describe("capitalize", () => {
  it("raises the first letter and leaves the rest alone", () => {
    expect(capitalize(TERMS.quest.one)).toBe("Quest");
    expect(capitalize(TERMS.quest.many)).toBe("Quests");
  });

  it("does not lowercase the remainder, so an acronym survives", () => {
    expect(capitalize("eNPS score")).toBe("ENPS score");
  });

  it("tolerates an empty string", () => {
    expect(capitalize("")).toBe("");
  });
});

describe("TERMS", () => {
  it("keeps every term lowercase, so call sites decide the casing", () => {
    for (const [key, term] of Object.entries(TERMS)) {
      expect(term.one, key).toBe(term.one.toLowerCase());
      expect(term.many, key).toBe(term.many.toLowerCase());
    }
  });
});

describe("statusLabel", () => {
  it("gives each status a human label", () => {
    expect(statusLabel("PENDING_APPROVAL")).toBe("Awaiting approval");
    expect(statusLabel("REWARDED")).toBe("Rewarded");
  });

  it("reads differently for an advocate where that matters", () => {
    // A rep sent it; to the advocate it is simply new.
    expect(statusLabel("REQUESTED", "business")).toBe("Sent");
    expect(statusLabel("REQUESTED", "advocate")).toBe("New");
    // The advocate said it was done; the business has not looked yet.
    expect(statusLabel("COMPLETED", "advocate")).toBe("Awaiting review");
  });

  it("falls back to the business label when there is no advocate variant", () => {
    expect(statusLabel("ACCEPTED", "advocate")).toBe("Accepted");
  });

  it("covers every status in the schema", () => {
    for (const s of [
      "PENDING_APPROVAL",
      "REQUESTED",
      "ACCEPTED",
      "COMPLETED",
      "VERIFIED",
      "REWARDED",
      "DECLINED",
      "CANCELLED",
    ]) {
      expect(OPPORTUNITY_STATUS[s], s).toBeDefined();
      expect(statusLabel(s), s).not.toBe(s);
    }
  });

  it("passes an unknown status through rather than throwing", () => {
    expect(statusLabel("WAT")).toBe("WAT");
    expect(statusRole("WAT")).toBe("waiting");
  });
});
