/**
 * Real money, as opposed to the reward currency in `currency.ts`.
 *
 * Amounts are integer cents end to end — `BigInt` in the database and here —
 * and never pass through a float. That matters less for display than for the
 * habit: the moment one total is computed as `cents / 100` the rounding errors
 * start, and nothing flags them.
 *
 * **Assumes USD.** No business has a currency of its own yet. When one does,
 * it becomes a parameter here and the call sites pass the business's.
 */
const WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * Whole dollars, rounded half away from zero, for totals on a dashboard where
 * cents are noise. `formatCents(123_456n)` is `$1,235`.
 */
export function formatCents(cents: bigint): string {
  const whole = cents >= 0n ? (cents + 50n) / 100n : (cents - 50n) / 100n;
  return WHOLE.format(whole);
}

/**
 * Parse an amount a person typed, in dollars, into integer cents.
 *
 * Accepts `1234`, `1,234.50`, `$1,234.5`, `.5`. Returns `null` for a blank
 * field — "no amount recorded" is different from zero. Throws `RangeError` for
 * anything it cannot represent exactly: negatives, more than two decimals,
 * exponents, stray characters. Never goes through a float, so a large amount
 * is exact to the cent.
 */
export function parseDollarsToCents(input: string): bigint | null {
  const text = input.trim().replace(/^\$/, "").replaceAll(",", "");
  if (input.trim() === "") return null;
  const match = /^(\d*)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match || (match[1] === "" && match[2] === undefined)) {
    throw new RangeError(`Not an amount in dollars and cents: "${input}"`);
  }
  const whole = BigInt(match[1] || "0");
  const cents = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return whole * 100n + cents;
}
