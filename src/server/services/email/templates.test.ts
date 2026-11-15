import { describe, expect, it } from "vitest";
import { escapeHtml, renderEmail, type TemplateData } from "./templates";

const common = {
  businessName: "Acme",
  advocateName: "Dana",
  unsubscribeUrl:
    "https://dealio.info/unsubscribe/7c1b3e2a-0000-4000-8000-000000000000",
};

const SAMPLES: Record<TemplateData["kind"], TemplateData> = {
  ADVOCATE_INVITE: {
    ...common,
    kind: "ADVOCATE_INVITE",
    inviteUrl: "https://dealio.info/invite/abc123",
    expiresAt: new Date("2026-11-29T12:00:00Z"),
  },
  QUEST_REQUESTED: {
    ...common,
    kind: "QUEST_REQUESTED",
    questTitle: "Reference call with Globex",
    questType: "REFERENCE_CALL",
    description: "30 minutes next week.\nThey want to hear about rollout.",
    rewardAmount: 30,
    dashboardUrl: "https://dealio.info/advocate",
  },
  QUEST_REWARDED: {
    ...common,
    kind: "QUEST_REWARDED",
    questTitle: "Reference call with Globex",
    amount: 30,
    balance: 45,
    rewardsUrl: "https://dealio.info/advocate/rewards",
  },
  REDEMPTION_APPROVED: {
    ...common,
    kind: "REDEMPTION_APPROVED",
    rewardName: "Coffee card",
    rewardsUrl: "https://dealio.info/advocate/rewards",
  },
  REDEMPTION_DELIVERED: {
    ...common,
    kind: "REDEMPTION_DELIVERED",
    rewardName: "Coffee card",
    rewardsUrl: "https://dealio.info/advocate/rewards",
  },
  REDEMPTION_REJECTED: {
    ...common,
    kind: "REDEMPTION_REJECTED",
    rewardName: "Coffee card",
    cost: 25,
    reason: "Out of stock — try the voucher instead.",
    rewardsUrl: "https://dealio.info/advocate/rewards",
  },
};

describe("renderEmail", () => {
  for (const [kind, data] of Object.entries(SAMPLES)) {
    it(`renders ${kind}`, () => {
      const email = renderEmail(data);
      // Snapshots catch unintended copy or layout changes; update them
      // deliberately with `vitest -u` when the change is the point.
      expect(email.subject).toMatchSnapshot("subject");
      expect(email.text).toMatchSnapshot("text");
      expect(email.html).toMatchSnapshot("html");
    });

    it(`${kind}: the text version carries every link the HTML does`, () => {
      const email = renderEmail(data);
      const links = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) =>
        m[1]!.replaceAll("&amp;", "&"),
      );
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) expect(email.text).toContain(link);
      expect(email.text).toContain(common.unsubscribeUrl);
    });
  }

  it("escapes everything a person typed", () => {
    const email = renderEmail({
      ...SAMPLES.REDEMPTION_REJECTED,
      businessName: `<script>alert("x")</script>`,
      rewardName: `"><img src=x onerror=alert(1)>`,
      reason: "<b>no</b>",
    } as TemplateData);

    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("<b>no</b>");
    expect(email.html).toContain("&lt;script&gt;");
    // Plain text is not HTML, so it says exactly what was typed.
    expect(email.text).toContain("<b>no</b>");
  });

  it("greets by name when there is one, and politely when there is not", () => {
    expect(renderEmail(SAMPLES.QUEST_REWARDED).text).toContain("Hi Dana,");
    expect(
      renderEmail({ ...SAMPLES.QUEST_REWARDED, advocateName: null }).text,
    ).toContain("Hi,\n");
  });

  it("leaves out an empty description or reason rather than quoting nothing", () => {
    expect(
      renderEmail({ ...SAMPLES.QUEST_REQUESTED, description: null } as TemplateData)
        .text,
    ).not.toContain("> ");
    expect(
      renderEmail({ ...SAMPLES.REDEMPTION_REJECTED, reason: null } as TemplateData)
        .text,
    ).not.toContain("> ");
  });
});

describe("escapeHtml", () => {
  it("escapes the five characters that matter, ampersand first", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});
