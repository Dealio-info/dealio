import { describe, expect, it } from "vitest";
import { formatCents } from "./money";

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
