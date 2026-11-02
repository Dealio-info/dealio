"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/**
 * Theme state for the whole app.
 *
 * `attribute="class"` because our dark tokens hang off a `.dark` class — set in
 * `globals.css` via `@custom-variant dark` — not off a media query. The two
 * approaches compete, which is why there are no `prefers-color-scheme` rules in
 * the stylesheet.
 *
 * `defaultTheme="system"` so first-time visitors get whatever their OS already
 * asked for, and only an explicit choice overrides it.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}
