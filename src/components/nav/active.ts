/**
 * Which nav item a path belongs to.
 *
 * Naively, "the path starts with this item's href". That is wrong the moment
 * one item is a prefix of another: `/app` prefixes `/app/advocates`, so the
 * dashboard tab stayed lit on every page and two tabs looked active at once.
 *
 * The rule is **longest match wins**. An item is active when it is the most
 * specific one that matches, so `/app/advocates` lights Advocates alone and
 * `/app` lights Dashboard alone.
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  const matches = hrefs.filter(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, href) => (href.length > best.length ? href : best));
}

export function isActive(
  pathname: string,
  href: string,
  hrefs: readonly string[],
): boolean {
  return activeHref(pathname, hrefs) === href;
}
