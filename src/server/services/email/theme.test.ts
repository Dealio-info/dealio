import { describe, expect, it } from "vitest";
import { parse, ratio } from "@/lib/contrast";
import { EMAIL_THEME as T } from "./theme";

/**
 * The email palette is outside `globals.css`, so the app's contrast test
 * cannot see it. Same thresholds, same maths.
 */
describe("email colours", () => {
  it.each([
    ["text", T.text, T.surface],
    ["muted text", T.muted, T.surface],
    ["footer text", T.muted, T.background],
    ["button label", T.buttonText, T.buttonBackground],
  ])("%s meets WCAG AA (4.5:1)", (_name, fg, bg) => {
    const r = ratio(parse(fg), parse(bg));
    expect(r, `${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
