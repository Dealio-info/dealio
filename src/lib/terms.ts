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
