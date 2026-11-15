import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type ServiceContext,
} from "@/server/context";
import { disconnectTestPrisma, resetDb, testPrisma } from "@/test/integration/harness";
import { makeBusiness, makeUser } from "@/test/integration/fixtures";
import { inviteAdvocate } from "@/server/services/advocates/invite-advocate";
import { claimInvite } from "@/server/services/advocates/claim-invite";
import { createOpportunity } from "@/server/services/opportunities/create-opportunity";
import { transitionOpportunity } from "@/server/services/opportunities/transition-opportunity";
import { createReward } from "@/server/services/rewards/catalog";
import {
  approveRedemption,
  rejectRedemption,
  requestRedemption,
} from "@/server/services/rewards/redemptions";
import {
  EmailTransportError,
  type EmailTransport,
  type OutgoingEmail,
} from "./transport";
import { sendEmail, type EmailDeps } from "./send";

const prisma = testPrisma();

beforeEach(resetDb);
afterAll(disconnectTestPrisma);

/** Records what it is asked to send; can be told to fail. */
function recordingTransport() {
  const sent: Array<{ email: OutgoingEmail; idempotencyKey: string }> = [];
  let failNext: string | null = null;
  const transport: EmailTransport = {
    async send(email, { idempotencyKey }) {
      if (failNext) {
        const reason = failNext;
        failNext = null;
        throw new EmailTransportError(reason);
      }
      sent.push({ email, idempotencyKey });
      return { id: `msg_${sent.length}` };
    },
  };
  return { transport, sent, failNext: (reason: string) => (failNext = reason) };
}

function deps(transport: EmailTransport): EmailDeps {
  return {
    transport,
    appUrl: "https://dealio.info",
    emailFrom: "Dealio <noreply@dealio.info>",
  };
}

async function scenario() {
  const [business, adminUser] = await Promise.all([
    makeBusiness({ name: "Acme" }),
    makeUser(),
  ]);
  const admin: ServiceContext = {
    db: prisma,
    actor: {
      kind: "business",
      userId: adminUser.id,
      businessId: business.id,
      role: "BUSINESS_ADMIN",
    },
  };
  const invite = await inviteAdvocate(admin, {
    email: "dana@customer.com",
    name: "Dana",
  });
  return { business, admin, invite };
}

async function claimed() {
  const s = await scenario();
  const user = await makeUser();
  await claimInvite(prisma, { token: s.invite.token, userId: user.id });
  const advocate: ServiceContext = {
    db: prisma,
    actor: {
      kind: "advocate",
      userId: user.id,
      businessId: s.business.id,
      advocateId: s.invite.advocateId,
    },
  };
  return { ...s, advocate };
}

/** A quest carried to REWARDED through the real state machine. */
async function rewardedQuest(s: Awaited<ReturnType<typeof claimed>>, amount = 30) {
  const opp = await createOpportunity(s.admin, {
    advocateId: s.invite.advocateId,
    type: "REFERENCE_CALL",
    title: "Reference call with Globex",
    rewardAmount: amount,
  });
  await transitionOpportunity(s.admin, { opportunityId: opp.id, to: "REQUESTED" });
  await transitionOpportunity(s.advocate, { opportunityId: opp.id, to: "ACCEPTED" });
  await transitionOpportunity(s.advocate, { opportunityId: opp.id, to: "COMPLETED" });
  await transitionOpportunity(s.admin, { opportunityId: opp.id, to: "VERIFIED" });
  await transitionOpportunity(s.admin, { opportunityId: opp.id, to: "REWARDED" });
  return opp;
}

describe("sendEmail", () => {
  it("sends an event once, however many times it is asked", async () => {
    const s = await claimed();
    const opp = await rewardedQuest(s);
    const t = recordingTransport();

    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(
        await sendEmail(
          s.admin,
          { kind: "QUEST_REWARDED", opportunityId: opp.id },
          deps(t.transport),
        ),
      );
    }

    expect(results.map((r) => r.outcome)).toEqual(["sent", "duplicate", "duplicate"]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]!.idempotencyKey).toBe(`QUEST_REWARDED:${opp.id}`);
    const rows = await prisma.emailSend.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "SENT",
      providerMessageId: "msg_1",
      toEmail: "dana@customer.com",
      attempts: 1,
    });
  });

  it("addresses the advocate on record, from the business, with one-click unsubscribe", async () => {
    const s = await claimed();
    const opp = await rewardedQuest(s, 30);
    const t = recordingTransport();

    await sendEmail(
      s.admin,
      { kind: "QUEST_REWARDED", opportunityId: opp.id },
      deps(t.transport),
    );

    const { email } = t.sent[0]!;
    const advocate = await prisma.advocate.findUniqueOrThrow({
      where: { id: s.invite.advocateId },
    });
    expect(email.to).toBe("dana@customer.com");
    expect(email.from).toBe('"Acme via Dealio" <noreply@dealio.info>');
    expect(email.subject).toContain("30");
    expect(email.text).toContain("balance with them is now 30");
    expect(email.headers).toEqual({
      "List-Unsubscribe": `<https://dealio.info/api/email/unsubscribe/${advocate.emailUnsubscribeToken}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(email.text).toContain(
      `https://dealio.info/unsubscribe/${advocate.emailUnsubscribeToken}`,
    );
  });

  it("records a failure and lets a later attempt retry it", async () => {
    const s = await claimed();
    const opp = await rewardedQuest(s);
    const t = recordingTransport();
    const request = { kind: "QUEST_REWARDED", opportunityId: opp.id } as const;

    t.failNext("Resend refused the email (403): domain not verified");
    const first = await sendEmail(s.admin, request, deps(t.transport));
    expect(first.outcome).toBe("failed");
    expect(await prisma.emailSend.findFirstOrThrow()).toMatchObject({
      status: "FAILED",
      error: "Resend refused the email (403): domain not verified",
    });

    const second = await sendEmail(s.admin, request, deps(t.transport));
    expect(second.outcome).toBe("sent");
    expect(await prisma.emailSend.findFirstOrThrow()).toMatchObject({
      status: "SENT",
      attempts: 2,
      error: null,
    });
    expect(t.sent).toHaveLength(1);
  });

  it("never throws for a delivery failure — the action that triggered it succeeded", async () => {
    const s = await claimed();
    const opp = await rewardedQuest(s);
    const transport: EmailTransport = {
      async send() {
        throw new Error("socket hang up");
      },
    };

    await expect(
      sendEmail(
        s.admin,
        { kind: "QUEST_REWARDED", opportunityId: opp.id },
        deps(transport),
      ),
    ).resolves.toMatchObject({ outcome: "failed" });
  });

  it("respects an unsubscribe, and records that it did", async () => {
    const s = await claimed();
    const opp = await rewardedQuest(s);
    await prisma.advocate.update({
      where: { id: s.invite.advocateId },
      data: { emailOptedOutAt: new Date() },
    });
    const t = recordingTransport();

    const result = await sendEmail(
      s.admin,
      { kind: "QUEST_REWARDED", opportunityId: opp.id },
      deps(t.transport),
    );

    expect(result.outcome).toBe("skipped");
    expect(t.sent).toHaveLength(0);
    expect(await prisma.emailSend.findFirstOrThrow()).toMatchObject({
      status: "SKIPPED",
    });
  });

  it("refuses to announce what has not happened", async () => {
    const s = await claimed();
    const draft = await createOpportunity(s.admin, {
      advocateId: s.invite.advocateId,
      type: "TESTIMONIAL",
      title: "Draft",
      rewardAmount: 5,
    });
    const t = recordingTransport();

    // A draft has not been sent, and it has certainly not been paid.
    await expect(
      sendEmail(
        s.admin,
        { kind: "QUEST_REQUESTED", opportunityId: draft.id },
        deps(t.transport),
      ),
    ).rejects.toThrow(ConflictError);
    await expect(
      sendEmail(
        s.admin,
        { kind: "QUEST_REWARDED", opportunityId: draft.id },
        deps(t.transport),
      ),
    ).rejects.toThrow(ConflictError);
    expect(t.sent).toHaveLength(0);
    expect(await prisma.emailSend.count()).toBe(0);
  });

  it("will not email about another business's records", async () => {
    const s = await claimed();
    const opp = await rewardedQuest(s);
    const other = await scenario();
    const t = recordingTransport();

    await expect(
      sendEmail(
        other.admin,
        { kind: "QUEST_REWARDED", opportunityId: opp.id },
        deps(t.transport),
      ),
    ).rejects.toThrow(NotFoundError);
    await expect(
      sendEmail(
        other.admin,
        { kind: "ADVOCATE_INVITE", token: s.invite.token },
        deps(t.transport),
      ),
    ).rejects.toThrow(NotFoundError);
    // QUEST_REQUESTED too: unlike the reward email it reads no balance, so the
    // opportunity lookup's own scope is the only thing that can refuse it.
    await expect(
      sendEmail(
        other.admin,
        { kind: "QUEST_REQUESTED", opportunityId: opp.id },
        deps(t.transport),
      ),
    ).rejects.toThrow(NotFoundError);

    const reward = await createReward(s.admin, { name: "Mug", cost: 5 });
    const redemption = await requestRedemption(s.advocate, { rewardId: reward.id });
    await approveRedemption(s.admin, { redemptionId: redemption.id });
    await expect(
      sendEmail(
        other.admin,
        { kind: "REDEMPTION_APPROVED", redemptionId: redemption.id },
        deps(t.transport),
      ),
    ).rejects.toThrow(NotFoundError);
    expect(t.sent).toHaveLength(0);
  });

  it("is a business-side action — an advocate cannot trigger email", async () => {
    const s = await claimed();
    const opp = await rewardedQuest(s);
    await expect(
      sendEmail(
        s.advocate,
        { kind: "QUEST_REWARDED", opportunityId: opp.id },
        deps(recordingTransport().transport),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("sends redemption decisions, including the reason for a decline", async () => {
    const s = await claimed();
    await rewardedQuest(s, 30);
    const reward = await createReward(s.admin, { name: "Coffee card", cost: 10 });
    const approved = await requestRedemption(s.advocate, { rewardId: reward.id });
    await approveRedemption(s.admin, { redemptionId: approved.id });
    const declined = await requestRedemption(s.advocate, { rewardId: reward.id });
    await rejectRedemption(s.admin, {
      redemptionId: declined.id,
      reason: "Out of stock",
    });
    const t = recordingTransport();

    await sendEmail(
      s.admin,
      { kind: "REDEMPTION_APPROVED", redemptionId: approved.id },
      deps(t.transport),
    );
    await sendEmail(
      s.admin,
      { kind: "REDEMPTION_REJECTED", redemptionId: declined.id },
      deps(t.transport),
    );
    await expect(
      sendEmail(
        s.admin,
        { kind: "REDEMPTION_DELIVERED", redemptionId: approved.id },
        deps(t.transport),
      ),
    ).rejects.toThrow(ConflictError);

    expect(t.sent.map((x) => x.email.subject)).toEqual([
      "Acme approved your Coffee card",
      "Acme could not approve your Coffee card",
    ]);
    expect(t.sent[1]!.email.text).toContain("> Out of stock");
  });
});

describe("the invite email", () => {
  it("carries the working link, and the token is never stored", async () => {
    const s = await scenario();
    const t = recordingTransport();

    const result = await sendEmail(
      s.admin,
      { kind: "ADVOCATE_INVITE", token: s.invite.token },
      deps(t.transport),
    );

    expect(result.outcome).toBe("sent");
    expect(t.sent[0]!.email.to).toBe("dana@customer.com");
    expect(t.sent[0]!.email.text).toContain(
      `https://dealio.info/invite/${s.invite.token}`,
    );
    // The row records that it was sent, not what the link was: only the
    // token's hash is kept anywhere, and the email log must not undo that.
    const row = await prisma.emailSend.findFirstOrThrow();
    expect(JSON.stringify(row)).not.toContain(s.invite.token);
  });

  it("refuses a token that is not this business's open invite", async () => {
    const s = await scenario();
    const t = recordingTransport();

    await expect(
      sendEmail(
        s.admin,
        { kind: "ADVOCATE_INVITE", token: "made-up" },
        deps(t.transport),
      ),
    ).rejects.toThrow(NotFoundError);

    const user = await makeUser();
    await claimInvite(prisma, { token: s.invite.token, userId: user.id });
    await expect(
      sendEmail(
        s.admin,
        { kind: "ADVOCATE_INVITE", token: s.invite.token },
        deps(t.transport),
      ),
    ).rejects.toThrow(ConflictError);
    expect(t.sent).toHaveLength(0);
  });

  it("is a new email for each new link", async () => {
    const s = await scenario();
    const again = await inviteAdvocate(s.admin, { email: "dana@customer.com" });
    const t = recordingTransport();

    await sendEmail(
      s.admin,
      { kind: "ADVOCATE_INVITE", token: s.invite.token },
      deps(t.transport),
    ).catch(() => null);
    const second = await sendEmail(
      s.admin,
      { kind: "ADVOCATE_INVITE", token: again.token },
      deps(t.transport),
    );

    // The first link was expired by the re-invite, so only the second sends.
    expect(second.outcome).toBe("sent");
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]!.email.text).toContain(again.token);
  });
});
