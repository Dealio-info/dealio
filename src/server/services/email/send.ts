import { Prisma } from "@/generated/prisma/client";
import type { EmailKind } from "@/generated/prisma/enums";
import { serverEnv } from "@/lib/env";
import {
  ConflictError,
  NotFoundError,
  assertBusinessActor,
  type BusinessActor,
  type ServiceContext,
} from "@/server/context";
import { hashInviteToken } from "@/server/services/advocates/invite-token";
import { getBalance } from "@/server/services/rewards/balance";
import { renderEmail, type TemplateData } from "./templates";
import { defaultTransport, fromHeader, type EmailTransport } from "./transport";

/**
 * What to email about, named by the record it concerns.
 *
 * There is no recipient, subject or body here, and no way to supply one. The
 * address is always the advocate's on that record and the words are always
 * the template's — the prototype's convention, kept because it makes the email
 * path unable to send arbitrary mail to arbitrary people on a caller's behalf.
 *
 * The invite carries its token rather than an id because the token is the
 * link, and only its hash is stored; the hash is also how the invite is found,
 * so a token that is not a live invite of this business cannot be emailed.
 */
export type EmailRequest =
  | { readonly kind: "ADVOCATE_INVITE"; readonly token: string }
  | {
      readonly kind: "QUEST_REQUESTED" | "QUEST_REWARDED";
      readonly opportunityId: string;
    }
  | {
      readonly kind:
        "REDEMPTION_APPROVED" | "REDEMPTION_REJECTED" | "REDEMPTION_DELIVERED";
      readonly redemptionId: string;
    };

/**
 * - `sent`: delivered to the provider.
 * - `duplicate`: this event was already emailed (or is being), so nothing more.
 * - `skipped`: the advocate has unsubscribed.
 * - `failed`: the provider refused or was unreachable. Recorded; a later call
 *   for the same event retries.
 */
export type EmailOutcome = "sent" | "duplicate" | "skipped" | "failed";

export type EmailDeps = {
  readonly transport: EmailTransport;
  readonly appUrl: string;
  readonly emailFrom: string;
};

function defaultDeps(): EmailDeps {
  return {
    transport: defaultTransport(),
    appUrl: serverEnv.appUrl,
    emailFrom: serverEnv.emailFrom,
  };
}

type Recipient = {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly emailOptedOutAt: Date | null;
  readonly emailUnsubscribeToken: string;
};

const RECIPIENT = {
  id: true,
  email: true,
  name: true,
  emailOptedOutAt: true,
  emailUnsubscribeToken: true,
} as const;

type Prepared = {
  readonly key: string;
  readonly kind: EmailKind;
  readonly recipient: Recipient;
  readonly businessName: string;
  readonly data: (unsubscribeUrl: string) => TemplateData;
};

/**
 * Email an advocate about something that happened at the caller's business.
 *
 * In order: find the record, scoped to the caller's business; refuse if the
 * event it would announce has not happened; skip if the advocate unsubscribed;
 * claim the event's row by its deterministic key, so only one caller ever
 * sends it; send, passing the same key to the provider; record the result.
 *
 * **Delivery failures do not throw.** By the time this runs, the thing it
 * announces has happened and been committed, and an unreachable mail provider
 * must not turn a successful approval into an error page. The row says what
 * went wrong, and calling again for the same event retries it.
 *
 * Refusals do throw: a record that is not this business's, or an event that
 * has not occurred, is a bug in the caller, not weather.
 *
 * Business staff only. Nothing an advocate does emails anyone yet.
 */
export async function sendEmail(
  ctx: ServiceContext,
  request: EmailRequest,
  deps: EmailDeps = defaultDeps(),
): Promise<{ readonly outcome: EmailOutcome; readonly idempotencyKey: string }> {
  assertBusinessActor(ctx.actor);
  const prepared = await prepare(ctx, ctx.actor, request, deps.appUrl);
  const { key, kind, recipient } = prepared;
  const businessId = ctx.actor.businessId;

  if (recipient.emailOptedOutAt) {
    const recorded = await claim(ctx, {
      key,
      kind,
      businessId,
      recipient,
      subject: "(not sent: unsubscribed)",
      status: "SKIPPED",
    });
    return { outcome: recorded ? "skipped" : "duplicate", idempotencyKey: key };
  }

  const unsubscribeUrl = `${deps.appUrl}/unsubscribe/${recipient.emailUnsubscribeToken}`;
  const rendered = renderEmail(prepared.data(unsubscribeUrl));

  const claimed = await claim(ctx, {
    key,
    kind,
    businessId,
    recipient,
    subject: rendered.subject,
    status: "SENDING",
  });
  if (!claimed) return { outcome: "duplicate", idempotencyKey: key };

  try {
    const { id } = await deps.transport.send(
      {
        from: fromHeader(prepared.businessName, deps.emailFrom),
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          // RFC 8058 one-click unsubscribe. Mail clients POST to this URL
          // without showing a page, so it is a route handler, not the page
          // the body links to.
          "List-Unsubscribe": `<${deps.appUrl}/api/email/unsubscribe/${recipient.emailUnsubscribeToken}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      },
      { idempotencyKey: key },
    );
    await ctx.db.emailSend.update({
      where: { idempotencyKey: key },
      data: { status: "SENT", providerMessageId: id, sentAt: new Date(), error: null },
    });
    return { outcome: "sent", idempotencyKey: key };
  } catch (error) {
    await ctx.db.emailSend.update({
      where: { idempotencyKey: key },
      data: {
        status: "FAILED",
        error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
      },
    });
    return { outcome: "failed", idempotencyKey: key };
  }
}

/**
 * Take ownership of an event's row. True if this caller may proceed.
 *
 * A fresh key is inserted; the unique index means only one concurrent caller
 * wins. A key that exists is only taken over if its last attempt `FAILED`, and
 * then with a compare-and-swap, so two retries cannot both send. Anything else
 * — already sent, being sent, deliberately skipped — is a duplicate.
 *
 * A row left `SENDING` by a process that died mid-send stays that way and is
 * never retried automatically. That is the conservative failure: an email
 * possibly not sent, rather than possibly sent twice.
 */
async function claim(
  ctx: ServiceContext,
  row: {
    readonly key: string;
    readonly kind: EmailKind;
    readonly businessId: string;
    readonly recipient: Recipient;
    readonly subject: string;
    readonly status: "SENDING" | "SKIPPED";
  },
): Promise<boolean> {
  try {
    await ctx.db.emailSend.create({
      data: {
        idempotencyKey: row.key,
        kind: row.kind,
        status: row.status,
        businessId: row.businessId,
        advocateId: row.recipient.id,
        toEmail: row.recipient.email,
        subject: row.subject,
      },
    });
    return true;
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }
  if (row.status === "SKIPPED") return false;

  const { count } = await ctx.db.emailSend.updateMany({
    where: { idempotencyKey: row.key, status: "FAILED" },
    data: {
      status: "SENDING",
      attempts: { increment: 1 },
      toEmail: row.recipient.email,
      subject: row.subject,
    },
  });
  return count === 1;
}

/** Statuses at which a quest has gone out to the advocate. */
const QUEST_SENT = new Set([
  "REQUESTED",
  "ACCEPTED",
  "COMPLETED",
  "VERIFIED",
  "REWARDED",
  "DECLINED",
]);

/** Which redemption statuses each redemption email may announce. */
const REDEMPTION_REACHED: Record<string, ReadonlySet<string>> = {
  REDEMPTION_APPROVED: new Set(["APPROVED", "ORDERED", "DELIVERED"]),
  REDEMPTION_REJECTED: new Set(["REJECTED"]),
  REDEMPTION_DELIVERED: new Set(["DELIVERED"]),
};

/**
 * Load the record behind a request, check the event it announces really
 * happened, and gather what the template needs. Every lookup is scoped to the
 * caller's business, so another tenant's id is simply not found.
 */
async function prepare(
  ctx: ServiceContext,
  actor: BusinessActor,
  request: EmailRequest,
  appUrl: string,
): Promise<Prepared> {
  const businessId = actor.businessId;
  const base = (businessName: string, recipient: Recipient) => ({
    businessName,
    advocateName: recipient.name,
  });

  switch (request.kind) {
    case "ADVOCATE_INVITE": {
      const invite = await ctx.db.advocateInvite.findUnique({
        where: { tokenHash: hashInviteToken(request.token) },
        select: {
          id: true,
          expiresAt: true,
          claimedAt: true,
          advocate: {
            select: {
              ...RECIPIENT,
              businessId: true,
              business: { select: { name: true } },
            },
          },
        },
      });
      if (!invite || invite.advocate.businessId !== businessId) {
        throw new NotFoundError("No such invite");
      }
      if (invite.claimedAt || invite.expiresAt.getTime() <= Date.now()) {
        throw new ConflictError(
          "That invite is no longer open, so there is nothing to send",
        );
      }
      const recipient = invite.advocate;
      const businessName = recipient.business.name;
      return {
        key: `ADVOCATE_INVITE:${invite.id}`,
        kind: "ADVOCATE_INVITE",
        recipient,
        businessName,
        data: (unsubscribeUrl) => ({
          ...base(businessName, recipient),
          unsubscribeUrl,
          kind: "ADVOCATE_INVITE",
          inviteUrl: `${appUrl}/invite/${request.token}`,
          expiresAt: invite.expiresAt,
        }),
      };
    }

    case "QUEST_REQUESTED":
    case "QUEST_REWARDED": {
      const opp = await ctx.db.opportunity.findFirst({
        where: { id: request.opportunityId, businessId },
        select: {
          id: true,
          status: true,
          title: true,
          type: true,
          description: true,
          rewardAmount: true,
          advocate: { select: RECIPIENT },
          business: { select: { name: true } },
        },
      });
      if (!opp) throw new NotFoundError("No such opportunity");
      const happened =
        request.kind === "QUEST_REWARDED"
          ? opp.status === "REWARDED"
          : QUEST_SENT.has(opp.status);
      if (!happened) {
        throw new ConflictError(
          `Nothing to announce: the opportunity is ${opp.status}`,
        );
      }
      const recipient = opp.advocate;
      const businessName = opp.business.name;
      const key = `${request.kind}:${opp.id}`;

      if (request.kind === "QUEST_REQUESTED") {
        return {
          key,
          kind: request.kind,
          recipient,
          businessName,
          data: (unsubscribeUrl) => ({
            ...base(businessName, recipient),
            unsubscribeUrl,
            kind: "QUEST_REQUESTED",
            questTitle: opp.title,
            questType: opp.type,
            description: opp.description,
            rewardAmount: opp.rewardAmount,
            dashboardUrl: `${appUrl}/advocate`,
          }),
        };
      }

      const balance = await getBalance(ctx, { advocateId: recipient.id });
      return {
        key,
        kind: request.kind,
        recipient,
        businessName,
        data: (unsubscribeUrl) => ({
          ...base(businessName, recipient),
          unsubscribeUrl,
          kind: "QUEST_REWARDED",
          questTitle: opp.title,
          amount: opp.rewardAmount,
          balance,
          rewardsUrl: `${appUrl}/advocate/rewards`,
        }),
      };
    }

    case "REDEMPTION_APPROVED":
    case "REDEMPTION_REJECTED":
    case "REDEMPTION_DELIVERED": {
      const redemption = await ctx.db.redemption.findFirst({
        where: { id: request.redemptionId, businessId },
        select: {
          id: true,
          status: true,
          rewardName: true,
          cost: true,
          failureReason: true,
          advocate: { select: RECIPIENT },
          business: { select: { name: true } },
        },
      });
      if (!redemption) throw new NotFoundError("No such redemption");
      if (!REDEMPTION_REACHED[request.kind]!.has(redemption.status)) {
        throw new ConflictError(
          `Nothing to announce: the redemption is ${redemption.status}`,
        );
      }
      const recipient = redemption.advocate;
      const businessName = redemption.business.name;
      const rewardsUrl = `${appUrl}/advocate/rewards`;
      const kind = request.kind;
      return {
        key: `${kind}:${redemption.id}`,
        kind,
        recipient,
        businessName,
        data: (unsubscribeUrl) => {
          const common = {
            ...base(businessName, recipient),
            unsubscribeUrl,
            rewardsUrl,
          };
          return kind === "REDEMPTION_REJECTED"
            ? {
                ...common,
                kind,
                rewardName: redemption.rewardName,
                cost: redemption.cost,
                reason: redemption.failureReason,
              }
            : { ...common, kind, rewardName: redemption.rewardName };
        },
      };
    }
  }
}
