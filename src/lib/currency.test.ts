import { describe, expect, it } from "vitest";
import { CURRENCY, formatCurrency } from "./currency";

/**
 * Proves the test harness runs, and pins the one behaviour the scaffold has:
 * the currency name is centralised and pluralises correctly. When the name is
 * finally chosen, only `currency.ts` changes and these tests keep passing.
 */
describe("formatCurrency", () => {
  it("uses the singular for exactly one", () => {
    expect(formatCurrency(1)).toBe(`1 ${CURRENCY.one}`);
  });

  it("uses the plural for zero and for many", () => {
    expect(formatCurrency(0)).toBe(`0 ${CURRENCY.many}`);
    expect(formatCurrency(7)).toBe(`7 ${CURRENCY.many}`);
  });

  it("groups thousands", () => {
    expect(formatCurrency(1234)).toBe(`1,234 ${CURRENCY.many}`);
  });
});
