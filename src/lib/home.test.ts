import { describe, expect, it } from "vitest";
import type { Identity } from "@/server/context";
import { homeFor } from "./home";

function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    user: { id: "u", email: "a@b.c" },
    isPlatformStaff: false,
    memberships: [],
    advocates: [],
    ...overrides,
  } as Identity;
}

const membership = {
  businessId: "b1",
  role: "BUSINESS_ADMIN",
} as Identity["memberships"][number];
const advocacy = {
  businessId: "b2",
  advocateId: "a1",
} as Identity["advocates"][number];

describe("homeFor", () => {
  it("sends business staff to the business side", () => {
    expect(homeFor(identity({ memberships: [membership] }))).toBe("/app");
  });

  it("sends an advocate to the advocate side", () => {
    expect(homeFor(identity({ advocates: [advocacy] }))).toBe("/advocate");
  });

  it("prefers the business side for someone who is both", () => {
    // A rep at one company can advocate for another. They arrive more often
    // to work than to collect, and the advocate side is one link away.
    expect(
      homeFor(identity({ memberships: [membership], advocates: [advocacy] })),
    ).toBe("/app");
  });

  it("has no home for someone who belongs nowhere — not even platform staff", () => {
    // Staff onboard businesses by script; there is no staff UI to send them to.
    expect(homeFor(identity())).toBeNull();
    expect(homeFor(identity({ isPlatformStaff: true }))).toBeNull();
  });
});
