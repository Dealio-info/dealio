import { describe, expect, it } from "vitest";
import { activeHref, isActive } from "./active";

/**
 * The bug this exists for: `/app` is a prefix of `/app/advocates`, so a
 * startsWith check lit the dashboard tab on every page, with two tabs active at
 * once. Nav highlighting looks too trivial to test right up until it is wrong
 * on every screen.
 */
const BUSINESS = [
  "/app",
  "/app/advocates",
  "/app/quests",
  "/app/rewards",
  "/app/settings",
];
const ADVOCATE = ["/advocate", "/advocate/rewards"];

describe("activeHref", () => {
  it("lights the index only on the index", () => {
    expect(activeHref("/app", BUSINESS)).toBe("/app");
  });

  it("lights the most specific match, not every prefix of it", () => {
    expect(activeHref("/app/advocates", BUSINESS)).toBe("/app/advocates");
    expect(activeHref("/app/settings", BUSINESS)).toBe("/app/settings");
  });

  it("keeps a section lit on its own sub-pages", () => {
    expect(activeHref("/app/quests/01a19", BUSINESS)).toBe("/app/quests");
  });

  it("does not light the index from a sub-page", () => {
    expect(isActive("/app/rewards", "/app", BUSINESS)).toBe(false);
    expect(isActive("/app/rewards", "/app/rewards", BUSINESS)).toBe(true);
  });

  it("lights exactly one item for any path under the nav", () => {
    for (const path of [
      "/app",
      "/app/advocates",
      "/app/quests",
      "/app/quests/abc",
      "/app/rewards",
      "/app/settings",
    ]) {
      const lit = BUSINESS.filter((h) => isActive(path, h, BUSINESS));
      expect(lit, path).toHaveLength(1);
    }
  });

  it("lights nothing for a path outside the nav", () => {
    expect(activeHref("/design", BUSINESS)).toBeNull();
    expect(activeHref("/sign-in", BUSINESS)).toBeNull();
  });

  it("does not treat a shared text prefix as a match", () => {
    // `/app` must not match `/application`, which startsWith alone would.
    expect(activeHref("/application", BUSINESS)).toBeNull();
  });

  it("works for the advocate nav too", () => {
    expect(activeHref("/advocate", ADVOCATE)).toBe("/advocate");
    expect(activeHref("/advocate/rewards", ADVOCATE)).toBe("/advocate/rewards");
    expect(isActive("/advocate/rewards", "/advocate", ADVOCATE)).toBe(false);
  });
});
