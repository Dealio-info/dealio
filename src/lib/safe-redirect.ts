/**
 * Reduce a caller-supplied `next` parameter to a safe, same-origin path.
 *
 * Auth callbacks carry a redirect target through the query string, and
 * reflecting that unchecked is an open redirect — a phishing primitive, since
 * the link genuinely starts on our domain before bouncing elsewhere.
 *
 * Only a relative single-slash path is allowed through; anything else falls
 * back to the given default.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value) return fallback;
  // Absolute URLs, protocol-relative URLs and backslash tricks all out.
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.includes("\\")) return fallback;
  // A control character or newline could split the Location header. Matching
  // control characters is the whole point here, so the rule is disabled rather
  // than the check weakened.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
