import { describe, expect, it } from "vitest";
import { ArgError, flag, optionalArg, parseArgs, requireArg } from "./args";

describe("parseArgs", () => {
  it("reads a key and its value", () => {
    expect(parseArgs(["--email", "a@b.com"])).toEqual({ email: "a@b.com" });
  });

  it("treats a key followed by another key as a flag", () => {
    expect(parseArgs(["--send", "--email", "a@b.com"])).toEqual({
      send: true,
      email: "a@b.com",
    });
  });

  it("treats a trailing key as a flag", () => {
    expect(parseArgs(["--email", "a@b.com", "--send"])).toEqual({
      email: "a@b.com",
      send: true,
    });
  });

  it("keeps values that contain spaces", () => {
    expect(parseArgs(["--name", "Acme Corp"])).toEqual({ name: "Acme Corp" });
  });

  it("ignores a bare --, which npm leaves behind", () => {
    expect(parseArgs(["--", "--name", "Acme"])).toEqual({ name: "Acme" });
  });

  it("refuses a leftover word rather than truncating a value", () => {
    // What you get from `--name Mike Kamilos` without quotes. Taking "Mike"
    // and dropping the rest would put a wrong name in the database silently.
    expect(() => parseArgs(["--name", "Mike", "Kamilos"])).toThrow(ArgError);
    expect(() => parseArgs(["--name", "Mike", "Kamilos"])).toThrow(/Kamilos/);
    expect(() => parseArgs(["--name", "Mike", "Kamilos"])).toThrow(/quote it/);
  });

  it("names every leftover word", () => {
    expect(() => parseArgs(["--name", "A", "B", "C"])).toThrow(/B C/);
  });

  it("refuses a stray word before any option", () => {
    expect(() => parseArgs(["junk", "--name", "Acme"])).toThrow(ArgError);
  });

  it("returns nothing for no arguments", () => {
    expect(parseArgs([])).toEqual({});
  });
});

describe("optionalArg", () => {
  it("trims", () => {
    expect(optionalArg({ name: "  Acme  " }, "name")).toBe("Acme");
  });

  it("is undefined for an absent key, a flag, or whitespace", () => {
    expect(optionalArg({}, "name")).toBeUndefined();
    expect(optionalArg({ name: true }, "name")).toBeUndefined();
    expect(optionalArg({ name: "   " }, "name")).toBeUndefined();
  });
});

describe("flag", () => {
  it("is true for a bare flag and for an explicit true", () => {
    expect(flag({ send: true }, "send")).toBe(true);
    expect(flag({ send: "true" }, "send")).toBe(true);
  });

  it("is false when absent or set to anything else", () => {
    expect(flag({}, "send")).toBe(false);
    expect(flag({ send: "false" }, "send")).toBe(false);
    expect(flag({ send: "yes" }, "send")).toBe(false);
  });
});

describe("requireArg", () => {
  it("returns a trimmed value", () => {
    expect(requireArg({ email: " a@b.com " }, "email")).toBe("a@b.com");
  });

  it("names the missing option", () => {
    expect(() => requireArg({}, "email")).toThrow(ArgError);
    expect(() => requireArg({}, "email")).toThrow(/--email/);
  });

  it("treats a bare flag as missing, since it carries no value", () => {
    expect(() => requireArg({ email: true }, "email")).toThrow(ArgError);
  });
});
