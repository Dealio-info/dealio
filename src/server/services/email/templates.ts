import { CURRENCY, formatCurrency } from "@/lib/currency";
import { questTypeLabel, TERMS } from "@/lib/terms";
import { EMAIL_THEME as T } from "./theme";

/** A rendered email, ready for any transport. */
export type RenderedEmail = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

/** What every advocate email carries, whatever it says. */
type Common = {
  readonly businessName: string;
  readonly advocateName: string | null;
  readonly unsubscribeUrl: string;
};

export type TemplateData =
  | (Common & {
      readonly kind: "ADVOCATE_INVITE";
      readonly inviteUrl: string;
      readonly expiresAt: Date;
    })
  | (Common & {
      readonly kind: "QUEST_REQUESTED";
      readonly questTitle: string;
      readonly questType: string;
      readonly description: string | null;
      readonly rewardAmount: number;
      readonly dashboardUrl: string;
    })
  | (Common & {
      readonly kind: "QUEST_REWARDED";
      readonly questTitle: string;
      readonly amount: number;
      readonly balance: number;
      readonly rewardsUrl: string;
    })
  | (Common & {
      readonly kind: "REDEMPTION_APPROVED" | "REDEMPTION_DELIVERED";
      readonly rewardName: string;
      readonly rewardsUrl: string;
    })
  | (Common & {
      readonly kind: "REDEMPTION_REJECTED";
      readonly rewardName: string;
      readonly cost: number;
      readonly reason: string | null;
      readonly rewardsUrl: string;
    });

/**
 * Escape for HTML text and attribute values.
 *
 * Every value that reaches an email came from a person somewhere — a business
 * name, a quest title, an admin's decline reason — so every one is escaped,
 * with no exceptions to remember. A business called `<script>` gets an email
 * that says `<script>`.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** One block of the body: plain prose, or the single call to action. */
type Block =
  | { readonly kind: "p"; readonly text: string; readonly quiet?: boolean }
  | { readonly kind: "quote"; readonly text: string }
  | { readonly kind: "button"; readonly label: string; readonly url: string };

/**
 * Lay out an email once, so every template agrees on structure and the HTML
 * and plain-text versions are built from the same blocks and cannot say
 * different things.
 */
function layout(
  data: Common,
  subject: string,
  heading: string,
  blocks: readonly Block[],
): RenderedEmail {
  const greeting = data.advocateName ? `Hi ${data.advocateName},` : "Hi,";
  const footer = `You are getting this because ${data.businessName} invited you to be an ${TERMS.advocate.one} on Dealio.`;

  const htmlBlock = (b: Block): string => {
    switch (b.kind) {
      case "p":
        return `<p style="margin:0 0 16px;color:${b.quiet ? T.muted : T.text};font-size:${b.quiet ? 14 : 16}px;line-height:1.5">${escapeHtml(b.text)}</p>`;
      case "quote":
        return `<p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid ${T.border};color:${T.text};font-size:15px;line-height:1.5;white-space:pre-wrap">${escapeHtml(b.text)}</p>`;
      case "button":
        return `<p style="margin:24px 0"><a href="${escapeHtml(b.url)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:${T.buttonBackground};color:${T.buttonText};font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(b.label)}</a></p>`;
    }
  };
  const textBlock = (b: Block): string =>
    b.kind === "button"
      ? `${b.label}: ${b.url}`
      : b.kind === "quote"
        ? `> ${b.text}`
        : b.text;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${T.background};font-family:${T.font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.background}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${T.surface};border:1px solid ${T.border};border-radius:8px">
<tr><td style="padding:32px">
<h1 style="margin:0 0 24px;color:${T.text};font-size:22px;line-height:1.3">${escapeHtml(heading)}</h1>
<p style="margin:0 0 16px;color:${T.text};font-size:16px;line-height:1.5">${escapeHtml(greeting)}</p>
${blocks.map(htmlBlock).join("\n")}
</td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;color:${T.muted};font-size:12px;line-height:1.5">${escapeHtml(footer)} <a href="${escapeHtml(data.unsubscribeUrl)}" style="color:${T.muted}">Unsubscribe from ${escapeHtml(data.businessName)} emails</a>.</p>
</td></tr>
</table>
</body>
</html>
`;

  const text = [
    heading,
    "",
    greeting,
    "",
    ...blocks.flatMap((b) => [textBlock(b), ""]),
    "--",
    footer,
    `Unsubscribe from ${data.businessName} emails: ${data.unsubscribeUrl}`,
    "",
  ].join("\n");

  return { subject, html, text };
}

/**
 * Render an email. Pure: no lookups, no clock, no environment — everything it
 * says arrives in `data`, which the sender builds from database records. That
 * is what makes these snapshot-testable, and what keeps a template from ever
 * choosing its own recipient.
 */
export function renderEmail(data: TemplateData): RenderedEmail {
  const b = data.businessName;
  switch (data.kind) {
    case "ADVOCATE_INVITE": {
      const subject = `${b} invited you to be an ${TERMS.advocate.one}`;
      return layout(data, subject, subject, [
        {
          kind: "p",
          text: `${b} would like you to be one of their ${TERMS.advocate.many}. You will see the ${TERMS.quest.many} they ask of you — a referral, a reference call, a testimonial — earn ${CURRENCY.many} for the ones you complete, and spend them on ${TERMS.reward.many} they offer.`,
        },
        { kind: "button", label: "Accept invitation", url: data.inviteUrl },
        {
          kind: "p",
          quiet: true,
          text: `This link works once and expires on ${data.expiresAt.toUTCString().slice(0, 16)}. If you were not expecting it, you can ignore this email.`,
        },
      ]);
    }
    case "QUEST_REQUESTED": {
      const type = questTypeLabel(data.questType).toLowerCase();
      const subject = `${b} asked you for a ${type}`;
      return layout(data, subject, data.questTitle, [
        {
          kind: "p",
          text: `${b} has a new ${TERMS.quest.one} for you. It is worth ${formatCurrency(data.rewardAmount)} once it is done and verified.`,
        },
        ...(data.description
          ? [{ kind: "quote" as const, text: data.description }]
          : []),
        { kind: "button", label: `See the ${TERMS.quest.one}`, url: data.dashboardUrl },
      ]);
    }
    case "QUEST_REWARDED": {
      const subject = `You earned ${formatCurrency(data.amount)} from ${b}`;
      return layout(data, subject, subject, [
        {
          kind: "p",
          text: `${b} verified “${data.questTitle}” and paid you ${formatCurrency(data.amount)}. Your balance with them is now ${formatCurrency(data.balance)}.`,
        },
        { kind: "button", label: `Spend your ${CURRENCY.many}`, url: data.rewardsUrl },
      ]);
    }
    case "REDEMPTION_APPROVED": {
      const subject = `${b} approved your ${data.rewardName}`;
      return layout(data, subject, subject, [
        {
          kind: "p",
          text: `Good news: ${b} approved your request for ${data.rewardName}. They will send it to you, and you will get another email when they have.`,
        },
        {
          kind: "button",
          label: `See your ${TERMS.reward.many}`,
          url: data.rewardsUrl,
        },
      ]);
    }
    case "REDEMPTION_DELIVERED": {
      const subject = `${b} sent your ${data.rewardName}`;
      return layout(data, subject, subject, [
        {
          kind: "p",
          text: `${b} has sent your ${data.rewardName}. If it has not arrived in the next few days, reply to your contact at ${b}.`,
        },
        {
          kind: "button",
          label: `See your ${TERMS.reward.many}`,
          url: data.rewardsUrl,
        },
      ]);
    }
    case "REDEMPTION_REJECTED": {
      const subject = `${b} could not approve your ${data.rewardName}`;
      return layout(data, subject, subject, [
        {
          kind: "p",
          text: `${b} declined your request for ${data.rewardName}. Nothing was taken: the ${formatCurrency(data.cost)} it would have cost are still yours to spend.`,
        },
        ...(data.reason ? [{ kind: "quote" as const, text: data.reason }] : []),
        {
          kind: "button",
          label: `Choose another ${TERMS.reward.one}`,
          url: data.rewardsUrl,
        },
      ]);
    }
  }
}
