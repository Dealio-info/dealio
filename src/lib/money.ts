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
