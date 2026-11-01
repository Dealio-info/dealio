import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Acme Corp")).toBe("acme-corp");
  });

  it("strips punctuation rather than encoding it", () => {
    expect(slugify("Globex, Inc.")).toBe("globex-inc");
    expect(slugify("Hooli & Co")).toBe("hooli-co");
  });

  it("collapses runs of separators and trims the ends", () => {
    expect(slugify("  Initech   --  Systems  ")).toBe("initech-systems");
  });

  it("folds accents to ASCII so the slug stays URL-safe", () => {
    expect(slugify("Café Zoë")).toBe("cafe-zoe");
  });

  it("keeps digits", () => {
    expect(slugify("Studio 54")).toBe("studio-54");
  });

  it("returns an empty string when nothing survives", () => {
    // The caller decides what to do about it — this is not the place to invent
    // a name, and silently returning "untitled" would hide a bad input.
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });
});
