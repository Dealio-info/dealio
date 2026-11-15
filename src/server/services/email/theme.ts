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
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  background: "#f6f6f6",
  surface: "#ffffff",
  text: "#111111",
  muted: "#6b6b6b",
  border: "#e5e5e5",
  buttonBackground: "#111111",
  buttonText: "#ffffff",
} as const;
