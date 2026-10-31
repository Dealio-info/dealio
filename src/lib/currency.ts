/**
 * The reward currency's name lives here and nowhere else.
 *
 * It is still undecided. "Coins" is a placeholder carried over from the
 * prototype. The brief asks for something short, punchy and positive — in the
 * spirit of Kudos, Zaps or Sparks. Rejected: "Dealios", "credits", "points".
 * Brainstormed but unchosen: Props, Pings, Zings, Amp, Glow, Buzz, Pops,
 * Bumps, Snaps, Cheers, Nods, Pips, Dings, Drops.
 *
 * Renaming should be a one-line change here. Never hardcode the word in a
 * component, email template or test — import it.
 */
export const CURRENCY = {
  /** Singular, lowercase. Capitalize at the call site if a sentence needs it. */
  one: "coin",
  /** Plural, lowercase. */
  many: "coins",
} as const;

/** `1 coin`, `5 coins`. */
export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} ${amount === 1 ? CURRENCY.one : CURRENCY.many}`;
}
