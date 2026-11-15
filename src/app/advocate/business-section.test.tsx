import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AdvocateActor } from "@/server/context";
import type { AdvocateDashboard } from "@/server/services/advocates/advocate-dashboard";
import type { OpportunitySummary } from "@/server/services/opportunities/list-opportunities";
import type { RewardSummary } from "@/server/services/rewards/catalog";

// The server actions are not under test and reach for the database; the
// component only needs something to bind its forms to.
vi.mock("./actions", () => ({ respondToQuest: vi.fn() }));
vi.mock("./rewards/actions", () => ({ claimReward: vi.fn() }));

const { BusinessSection } = await import("./business-section");

const actor: AdvocateActor = {
  kind: "advocate",
  userId: "u-1",
  businessId: "b-1",
  advocateId: "a-1",
};

function quest(
  id: string,
  title: string,
  status: OpportunitySummary["status"],
): OpportunitySummary {
  return {
    id,
    advocateId: "a-1",
    createdByUserId: "u-admin",
    type: "REFERENCE_CALL",
    status,
    title,
    rewardAmount: 10,
    prospectName: null,
    prospectCompany: null,
    influencedRevenueCents: null,
    createdAt: new Date("2026-03-01T00:00:00Z"),
  };
}

function reward(id: string, name: string, cost: number): RewardSummary {
  return {
    id,
    name,
    description: null,
    cost,
    isActive: true,
    tremendousProductId: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
  };
}

const base: AdvocateDashboard = {
  businessId: "b-1",
  businessName: "Acme",
  advocateId: "a-1",
  balance: 20,
  available: 12,
  earned: 45,
  opportunities: [
    quest("q1", "Reference call with Globex", "REQUESTED"),
    quest("q2", "Testimonial for the site", "ACCEPTED"),
    quest("q3", "Case study", "COMPLETED"),
    quest("q4", "Intro to Initech", "REWARDED"),
  ],
  // With 20 balance and 12 free, the Hoodie is affordable against one and not
  // the other — which is the point of the "within reach" test below.
  rewards: [
    reward("r1", "Sticker pack", 2),
    reward("r3", "Hoodie", 15),
    reward("r5", "Jacket", 18),
    reward("r4", "Headphones", 80),
  ],
  redemptions: [
    {
      id: "d1",
      advocateId: "a-1",
      rewardId: "r2",
      rewardName: "Coffee card",
      cost: 8,
      status: "REQUESTED",
      requestedAt: new Date("2026-03-03T00:00:00Z"),
      decidedAt: null,
      failureReason: null,
      advocate: { name: "Dana", email: "dana@customer.com" },
    },
  ],
  activity: [
    {
      id: "l1",
      delta: 10,
      reason: "OPPORTUNITY_REWARD",
      createdAt: new Date("2026-03-02T00:00:00Z"),
      label: "Intro to Initech",
    },
  ],
};

function section(name: string) {
  return screen.getByRole("heading", { name: new RegExp(`^${name}`) }).parentElement!
    .parentElement!;
}

describe("the advocate dashboard section", () => {
  it("states balance, what is free and what was earned", () => {
    render(<BusinessSection actor={actor} dashboard={base} />);
    expect(screen.getByText("12 free · 8 held for a claim")).toBeTruthy();
    expect(screen.getByText("45 earned in total")).toBeTruthy();
  });

  it("puts only quests with a move to make under 'Needs you', with the right buttons", () => {
    const { container } = render(<BusinessSection actor={actor} dashboard={base} />);
    const needs = container.querySelector("h2")!.parentElement!;
    const text = needs.textContent!;

    expect(text).toContain("Reference call with Globex");
    expect(text).toContain("Testimonial for the site");
    expect(text).not.toContain("Case study");
    expect(text).not.toContain("Intro to Initech");

    const buttons = within(needs)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(buttons).toEqual(["Accept", "Decline", "Mark done", "Cannot do this"]);
  });

  it("shows what is affordable now plus the next thing to work toward", () => {
    render(<BusinessSection actor={actor} dashboard={base} />);
    const reach = section("Within reach");
    const text = reach.textContent!;

    // Measured against the 12 free, not the 20 balance: only the Sticker pack
    // is affordable, and the Hoodie is the next goal. Against the balance the
    // Hoodie and Jacket would both read as claimable — and the claim would be
    // refused, because 8 is held for a pending request.
    expect(text).toContain("Sticker pack");
    expect(text).toContain("Hoodie");
    expect(text).not.toContain("Jacket");
    expect(text).not.toContain("Headphones");

    const claims = within(reach).getAllByRole("button", { name: "Claim" });
    expect(claims.map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, true]);
  });

  it("lists open claims and recent activity", () => {
    render(<BusinessSection actor={actor} dashboard={base} />);
    expect(section("Your claims").textContent).toContain("Coffee card");
    expect(screen.getByText("+10")).toBeTruthy();
  });

  it("says something useful when there is nothing at all", () => {
    render(
      <BusinessSection
        actor={actor}
        dashboard={{
          ...base,
          balance: 0,
          available: 0,
          earned: 0,
          opportunities: [],
          rewards: [],
          redemptions: [],
          activity: [],
        }}
      />,
    );
    expect(screen.getByText(/When Acme asks you for a referral/)).toBeTruthy();
    expect(screen.queryByText(/Within reach/)).toBeNull();
    expect(screen.queryByText(/held for a claim/)).toBeNull();
  });
});
