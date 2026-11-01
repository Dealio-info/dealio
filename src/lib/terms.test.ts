import { describe, expect, it } from "vitest";
import { capitalize, countOf, TERMS } from "./terms";

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
