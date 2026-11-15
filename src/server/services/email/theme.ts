/**
 * Every colour and font an email uses, in one place.
 *
 * Email clients ignore stylesheets and CSS variables, so the app's role tokens
 * cannot reach an inbox; templates inline these values instead. Kept neutral
 * for the same reason the app is — the palette arrives from the business lead
 * at the end — and kept here so that, when it does, email is one more file to
 * edit rather than a hunt through templates. See `docs/brand-brief.md`.
 */
export const EMAIL_THEME = {
  font: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  background: "#f8fafc",
  surface: "#ffffff",
  /** Brand navy, as body text. */
  text: "#111c2c",
  muted: "#49596e",
  border: "#d8dfe9",
  /** Lime with navy text — the app's primary button. */
  buttonBackground: "#81d147",
  buttonText: "#111c2c",
  /** The lime-to-teal bar across the top. Decoration; nothing sits on it. */
  accentFrom: "#81d147",
  accentTo: "#39aca3",
} as const;
