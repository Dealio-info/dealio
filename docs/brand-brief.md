# What the build needs from brand

A short, specific ask. Everything here is currently a placeholder or absent, and the UI tasks
(advocate participation, the two dashboards) are the first work that will bake these in — so it is
much cheaper to answer now than after three screens exist.

**Nothing here blocks the service layer.** Tasks 8, 10 and 11 are business rules and carry on
regardless. What is blocked is deciding how it all looks, and that decision gets made by accident
if nobody makes it on purpose.

## Where things stand

The app currently uses shadcn/ui's `neutral` default palette, which is pure greyscale — there is no
colour in the interface at all. Three brand colours were sketched from the product brief (deep navy
`#0b1220`, vibrant green `#16c172`, off-white `#f7f7f5`) and are defined in one file, but nothing
uses them, because they were never confirmed.

## 1. Palette

The useful unit is not "our brand colour" but a set of roles. We need one answer per row; "same as
above" is a fine answer.

| Role             | What it is                                               |
| ---------------- | -------------------------------------------------------- |
| Primary action   | The colour of the main button on a page                  |
| Page background  | Light mode. Also whether there is a dark mode at all     |
| Body text        | Against that background                                  |
| Accent / brand   | Used sparingly — a highlight, a logo mark, a celebration |
| Success          | An opportunity verified, currency earned                 |
| Warning / danger | A rejection, a deactivation, a destructive confirmation  |

Two constraints worth stating up front, because they are cheaper to honour than to retrofit:

- **Text on a background needs a contrast ratio of at least 4.5:1** (3:1 for large text) to meet
  WCAG AA. A vivid green on white usually fails this, which is why vivid brand colours tend to work
  as accents and borders rather than as text or as primary buttons with white labels.
- **Pick colours that survive both themes**, or decide there is only one theme. A palette chosen
  against white often turns muddy on dark.

## 2. Logo

- An SVG, ideally with a horizontal lockup and a square mark. SVG rather than PNG so it stays sharp
  and can inherit colour.
- Does it have a light and a dark variant, or one that works on both?
- A favicon can be derived from the square mark; no separate asset needed.

## 3. Words

- **Slogan**, if there is one, for the sign-in page and the marketing surface.
- **The currency name.** Still "coins", explicitly a placeholder. The brief asked for something
  short, punchy and positive — in the spirit of _Kudos_, _Zaps_, _Sparks_. Already rejected:
  _Dealios_, _credits_, _points_. It lives in exactly one constant, so renaming is a one-line
  change whenever it is decided.
- **"Quest" or something else** for the thing a rep sends an advocate. The prototype renamed
  "opportunity" to "quest" in its copy. We have followed that in user-facing text while keeping
  `Opportunity` as the internal name, so this is also a one-line change.

## 4. Tone

One or two sentences is enough, with an example. "Warm and encouraging, like a teammate" and
"crisp and professional, like a CRM" produce visibly different products, and the advocate side and
the business side could reasonably differ — advocates are being thanked, reps are working.

## What happens when these land

Colours are defined in one place, `src/app/globals.css`, and the interface is built against role
names (`bg-primary`, `text-foreground`) rather than literal colours. So a palette arriving later is
an edit to one file, not a sweep through every component. The same is true of the currency name and
the word for an opportunity, each of which lives in a single constant.

That is deliberate, and it is why "still deciding" is a workable answer. What does **not** survive
late changes is structure — how a page is laid out, what a dashboard puts first — so those are
being decided now, and reviewed with screenshots rather than described.
