import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { over, parse, ratio, type Rgba } from "@/lib/contrast";

/**
 * WCAG AA contrast for the theme, read from `globals.css` itself.
 *
 * The palette is the one thing in the app that can make it unreadable without
 * any test noticing, and it is about to change hands — the business lead owns
 * the final colours. So this checks the shipped values, in both themes, for the
 * pairs the components actually render, and fails with the ratio when a pair
 * drops below the line. Change a colour, run this, and it says what broke.
 *
 * Thresholds: 4.5:1 for text (1.4.3), 3:1 for focus rings and the borders that
 * identify form fields (1.4.11). Translucent colours are blended over what they
 * sit on, which is how the status badges are drawn.
 */

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

/** The `--name: value;` declarations of the first top-level block with this selector. */
function block(selector: string): Map<string, string> {
  const start = css.search(new RegExp(`(^|\\n)${selector.replace(".", "\\.")}\\s*\\{`));
  if (start === -1) throw new Error(`No ${selector} block in globals.css`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const vars = new Map<string, string>();
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    vars.set(m[1]!, m[2]!.trim());
  }
  return vars;
}

const THEME = block("@theme");
const ROOT = block(":root");
const DARK = block(".dark");
const THEMES = { light: ROOT, dark: new Map([...ROOT, ...DARK]) } as const;

function resolve(vars: Map<string, string>, value: string, depth = 0): string {
  if (depth > 10) throw new Error(`var() cycle at ${value}`);
  const m = /^var\(--([\w-]+)\)$/.exec(value.trim());
  if (!m) return value;
  const next = vars.get(m[1]!) ?? THEME.get(m[1]!) ?? THEME.get(`color-${m[1]!}`);
  if (next === undefined) throw new Error(`Unresolved var(--${m[1]})`);
  return resolve(vars, next, depth + 1);
}

/** A theme token as an opaque colour, translucent ones blended over `on`. */
function color(theme: keyof typeof THEMES, token: string, on?: Rgba): Rgba {
  const vars = THEMES[theme];
  const raw = vars.get(token) ?? THEME.get(`color-${token}`);
  if (raw === undefined) throw new Error(`No --${token} in the ${theme} theme`);
  const c = parse(resolve(vars, raw));
  if (c.a < 1) {
    if (!on) throw new Error(`--${token} is translucent; say what it sits on`);
    return over(c, on);
  }
  return c;
}

const TEXT = 4.5;
const NON_TEXT = 3;

/** [foreground, background, minimum] — every pairing a component renders. */
const PAIRS: ReadonlyArray<readonly [string, string, number]> = [
  ["foreground", "background", TEXT],
  ["card-foreground", "card", TEXT],
  ["popover-foreground", "popover", TEXT],
  ["muted-foreground", "background", TEXT],
  ["muted-foreground", "card", TEXT],
  ["muted-foreground", "muted", TEXT],
  ["primary-foreground", "primary", TEXT],
  ["secondary-foreground", "secondary", TEXT],
  ["accent-foreground", "accent", TEXT],
  ["destructive", "background", TEXT],
  ["destructive", "card", TEXT],
  // The text-safe brand colour: links, emphasised figures.
  ["brand-strong", "background", TEXT],
  ["brand-strong", "card", TEXT],
  // Both ends of gradient text must be readable on their own.
  ["gradient-text-from", "background", TEXT],
  ["gradient-text-to", "background", TEXT],
  ["gradient-text-from", "card", TEXT],
  ["gradient-text-to", "card", TEXT],
  // Focus must be visible wherever focusable things sit.
  ["ring", "background", NON_TEXT],
  ["ring", "card", NON_TEXT],
  // A text field is identified by its border alone.
  ["input", "background", NON_TEXT],
  ["input", "card", NON_TEXT],
];

/** Status badges: `text-status-x` on `bg-status-x/8`, on a card. */
const STATUSES = ["waiting", "active", "done", "success", "failed"] as const;
const BADGE_TINT = 0.1; // the heaviest tint StatusBadge uses

describe.each(Object.keys(THEMES) as Array<keyof typeof THEMES>)(
  "%s theme",
  (theme) => {
    it.each(PAIRS)("%s on %s ≥ %s:1", (fg, bg, min) => {
      const background = color(theme, bg);
      const r = ratio(color(theme, fg, background), background);
      expect(r, `${fg} on ${bg} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
    });

    it.each(STATUSES)("status-%s badge text is readable on its own tint", (status) => {
      const card = color(theme, "card");
      const text = color(theme, `status-${status}`, card);
      const tint = over(text, card, BADGE_TINT);
      const r = ratio(text, tint);
      expect(r, `status-${status} badge is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        TEXT,
      );
    });

    it("primary text on the brand gradient's lighter end stays readable", () => {
      // Buttons and chips drawn on `bg-brand-gradient` use the primary
      // foreground; the gradient's teal end is the darker, harder case.
      const teal = color(theme, "brand-teal");
      const r = ratio(color(theme, "primary-foreground"), teal);
      expect(
        r,
        `primary-foreground on brand-teal is ${r.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(TEXT);
    });
  },
);

describe("focus rings are drawn at the strength checked above", () => {
  it("no component fades the ring", () => {
    // shadcn's default is `ring-ring/50`. At half strength the light theme's
    // ring blends to about 2:1 against white — under the 3:1 a focus indicator
    // needs — so every ring is drawn at full strength, and this catches the
    // faded one coming back with the next `shadcn add`.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(tsx?|css)$/.test(entry.name) && path !== __filename) {
          const text = readFileSync(path, "utf8");
          for (const m of text.matchAll(/(?:ring|outline)-ring\/\d+/g)) {
            offenders.push(`${path}: ${m[0]}`);
          }
        }
      }
    };
    walk(join(__dirname, ".."));
    expect(offenders).toEqual([]);
  });
});

describe("the contrast checker itself", () => {
  it("agrees with WCAG's published extremes", () => {
    expect(ratio(parse("#000000"), parse("#ffffff"))).toBeCloseTo(21, 1);
    expect(ratio(parse("#777777"), parse("#ffffff"))).toBeCloseTo(4.48, 1);
  });

  it("reads hsl and oklch the same as hex", () => {
    expect(ratio(parse("hsl(0 0% 100%)"), parse("#ffffff"))).toBeCloseTo(1, 3);
    expect(ratio(parse("oklch(1 0 0)"), parse("#ffffff"))).toBeCloseTo(1, 2);
    expect(ratio(parse("oklch(0 0 0)"), parse("#000000"))).toBeCloseTo(1, 2);
  });
});
