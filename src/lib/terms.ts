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

/** The label for a status, from the point of view of whoever is looking. */
export function statusLabel(
  status: string,
  audience: "business" | "advocate" = "business",
): string {
  const entry = OPPORTUNITY_STATUS[status];
  if (!entry) return status;
  return audience === "advocate" ? (entry.advocate ?? entry.label) : entry.label;
}

export function statusRole(status: string): StatusRole {
  return OPPORTUNITY_STATUS[status]?.role ?? "waiting";
}
