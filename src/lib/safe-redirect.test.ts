import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("allows a relative path", () => {
    expect(safeRedirectPath("/app/dashboard")).toBe("/app/dashboard");
    expect(safeRedirectPath("/advocate")).toBe("/advocate");
    expect(safeRedirectPath("/app?tab=rewards")).toBe("/app?tab=rewards");
  });

  it("falls back when absent", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("uses a caller-supplied fallback", () => {
    expect(safeRedirectPath(null, "/app")).toBe("/app");
  });

  it.each([
    ["an absolute URL", "https://evil.example.com/steal"],
    ["a protocol-relative URL", "//evil.example.com"],
    ["a backslash-prefixed path", "/\\evil.example.com"],
    ["a backslash anywhere", "/app\\..\\evil"],
    ["a scheme without slashes", "javascript:alert(1)"],
    ["a bare host", "evil.example.com"],
  ])("rejects %s", (_label, value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });

  it("rejects control characters that could split a header", () => {
    expect(safeRedirectPath("/app\nLocation: https://evil.example.com")).toBe("/");
    expect(safeRedirectPath("/app\r\nSet-Cookie: x=1")).toBe("/");
  });
});
