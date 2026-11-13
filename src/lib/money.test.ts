import { describe, expect, it } from "vitest";
import { formatCents, parseDollarsToCents } from "./money";

describe("formatCents", () => {
  it("shows whole dollars with grouping", () => {
    expect(formatCents(0n)).toBe("$0");
    expect(formatCents(100n)).toBe("$1");
    expect(formatCents(123_456_700n)).toBe("$1,234,567");
  });

  it("rounds half away from zero, in integer arithmetic", () => {
    expect(formatCents(149n)).toBe("$1");
    expect(formatCents(150n)).toBe("$2");
    expect(formatCents(-150n)).toBe("-$2");
  });

  it("is exact beyond the range a float can hold", () => {
    // 2^53 + 1 dollars. A float conversion would print ...992.
    expect(formatCents(900_719_925_474_099_300n)).toBe("$9,007,199,254,740,993");
  });
});

describe("parseDollarsToCents", () => {
  it("reads what a person types", () => {
    expect(parseDollarsToCents("1234")).toBe(123_400n);
    expect(parseDollarsToCents("1,234.5")).toBe(123_450n);
    expect(parseDollarsToCents("$12,000.05")).toBe(1_200_005n);
    expect(parseDollarsToCents("  0.99 ")).toBe(99n);
    expect(parseDollarsToCents(".5")).toBe(50n);
  });

  it("treats blank as no amount, not zero", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("   ")).toBeNull();
  });

  it("refuses what it cannot represent exactly", () => {
    // A third decimal is a fraction of a cent: refusing beats silently rounding
    // a number someone will quote.
    for (const bad of ["1.234", "-5", "abc", "1.2.3", "1e6", "$", ",", "12,34,5.6.7"]) {
      expect(() => parseDollarsToCents(bad), bad).toThrow(RangeError);
    }
  });

  it("stays exact past a float's range", () => {
    expect(parseDollarsToCents("90071992547409.93")).toBe(9_007_199_254_740_993n);
  });
});
