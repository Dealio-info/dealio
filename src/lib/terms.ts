/**
 * User-facing nouns live here and nowhere else.
 *
 * The domain keeps its own names: the model is `Opportunity`, the table is
 * `opportunities`, the enum is `OpportunityStatus`. Those are stable, precise
 * and match the schema. What the product *calls* a thing is a branding choice
 * that has already moved once — the prototype renamed "opportunity" to "quest"
 * in copy while leaving its schema alone — so it is isolated here for the same
 * reason the currency name is isolated in `currency.ts`: renaming is one line
 * rather than a migration.
 *
 * So: use the domain name in code, and import from here for anything a person
 * reads — headings, buttons, emails, toasts, empty states. Never hardcode
 * "quest" or "advocate" in a component or an email template.
 *
 * If a term ever settles permanently, it can be inlined then. Doing it now
 * would be guessing.
 */

export interface Term {
  /** Singular, lowercase. */
  readonly one: string;
  /** Plural, lowercase. */
  readonly many: string;
}

export const TERMS = {
  /**
   * An advocacy request: a referral, reference call, testimonial, case study
   * or intro. The domain name is `Opportunity`; "quest" is the product's word
   * for it, chosen to carry the gamification.
   */
  quest: { one: "quest", many: "quests" },
  /** A customer who completes quests. Settled, but kept here for consistency. */
  advocate: { one: "advocate", many: "advocates" },
  /** A reward an advocate can redeem currency for. */
  reward: { one: "reward", many: "rewards" },
} as const satisfies Record<string, Term>;

/** `1 quest`, `4 quests`, `2,500 advocates`. */
export function countOf(amount: number, term: Term): string {
  return `${amount.toLocaleString()} ${amount === 1 ? term.one : term.many}`;
}

/**
 * Raise the first letter for a heading or the start of a sentence.
 *
 * Deliberately does not touch the rest of the string: lowercasing it would
 * mangle anything with an acronym or internal capital.
 */
export function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

/**
 * The kinds of quest, as a person reads them. Keyed by `OpportunityType`.
 * `hint` is what the business is actually asking the advocate to do.
 */
export const QUEST_TYPE: Record<
  string,
  { readonly label: string; readonly hint: string }
> = {
  EMAIL_INTRO: { label: "Intro", hint: "Introduce us to someone by email" },
  REFERENCE_CALL: { label: "Reference call", hint: "Take a call with a prospect" },
  CASE_STUDY: { label: "Case study", hint: "Help us write up your story" },
  TESTIMONIAL: { label: "Testimonial", hint: "A quote or review in your words" },
  PRODUCT_DEMO: { label: "Product demo", hint: "Show a prospect how you use it" },
};

export function questTypeLabel(type: string): string {
  return QUEST_TYPE[type]?.label ?? type;
}

/**
 * What each lifecycle status is called, and which colour role it carries.
 *
 * The domain names are blunt enum values; these are what a person reads, so
 * they live here with the other copy. The `role` is deliberately not a colour —
 * it maps to a `status-*` token in `globals.css`, which is what the palette
 * gives hue to later.
 *
 * Two audiences see the same status differently: a rep sees "Awaiting approval"
 * where an advocate would see nothing at all, since it has not been sent yet.
 * Where the wording differs, `advocate` overrides `label`.
 */
export type StatusRole = "waiting" | "active" | "done" | "success" | "failed";

export const OPPORTUNITY_STATUS: Record<
  string,
  { readonly label: string; readonly advocate?: string; readonly role: StatusRole }
> = {
  PENDING_APPROVAL: { label: "Awaiting approval", role: "waiting" },
  REQUESTED: { label: "Sent", advocate: "New", role: "waiting" },
  ACCEPTED: { label: "Accepted", role: "active" },
  COMPLETED: { label: "Marked done", advocate: "Awaiting review", role: "active" },
  VERIFIED: { label: "Verified", role: "done" },
  REWARDED: { label: "Rewarded", advocate: "Paid", role: "success" },
  DECLINED: { label: "Declined", role: "failed" },
  CANCELLED: { label: "Cancelled", role: "failed" },
};

/**
 * What each redemption status is called.
 *
 * A separate map from the quest statuses rather than one merged table, because
 * `REQUESTED` means different things in the two lifecycles — a quest the
 * business has sent out, and a reward an advocate has asked for — and would
 * otherwise read with the wrong label on half the pages.
 *
 * The two audiences diverge more here than anywhere else. "Approved" tells an
 * admin the decision is recorded; it tells an advocate their prize is coming,
 * which is the part they care about. `DELIVERED` is the business's "sent" and
 * the advocate's "received", and that is the same event seen from both ends.
 */
export const REDEMPTION_STATUS: Record<
  string,
  { readonly label: string; readonly advocate?: string; readonly role: StatusRole }
> = {
  REQUESTED: { label: "Awaiting approval", advocate: "Requested", role: "waiting" },
  APPROVED: { label: "Approved", advocate: "On its way", role: "active" },
  ORDERED: { label: "Ordered", advocate: "On its way", role: "active" },
  DELIVERED: { label: "Sent", advocate: "Received", role: "success" },
  REJECTED: { label: "Declined", role: "failed" },
  FAILED: { label: "Failed", role: "failed" },
};

/** Where an advocate stands with a business. Only staff ever see these. */
export const ADVOCATE_STATUS: Record<
  string,
  { readonly label: string; readonly advocate?: string; readonly role: StatusRole }
> = {
  INVITED: { label: "Invited", role: "waiting" },
  ACTIVE: { label: "Active", role: "success" },
  INACTIVE: { label: "Inactive", role: "failed" },
};

const STATUS_MAPS = {
  quest: OPPORTUNITY_STATUS,
  redemption: REDEMPTION_STATUS,
  advocate: ADVOCATE_STATUS,
} as const;

/** Which lifecycle a status belongs to. They have overlapping value names. */
export type StatusKind = keyof typeof STATUS_MAPS;

/** The label for a status, from the point of view of whoever is looking. */
export function statusLabel(
  status: string,
  audience: "business" | "advocate" = "business",
  kind: StatusKind = "quest",
): string {
  const entry = STATUS_MAPS[kind][status];
  if (!entry) return status;
  return audience === "advocate" ? (entry.advocate ?? entry.label) : entry.label;
}

export function statusRole(status: string, kind: StatusKind = "quest"): StatusRole {
  return STATUS_MAPS[kind][status]?.role ?? "waiting";
}
