/**
 * Turn a display name into a URL-safe slug.
 *
 * Used for `Business.slug`, which is unique, so the result is a *suggestion*:
 * the caller handles the collision. Deliberately lossy and deliberately not
 * clever — no transliteration tables, no uniqueness suffixes.
 */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      // Strip the combining marks NFKD just separated out, so "é" becomes "e".
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}
