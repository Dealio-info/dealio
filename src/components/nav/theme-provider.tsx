"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { useServerInsertedHTML } from "next/navigation";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "dealio-theme";
const THEMES: readonly Theme[] = ["light", "dark", "system"];

/**
 * Light, dark or system, class-based, with no flash on first paint.
 *
 * Written here rather than taken from `next-themes`, which renders its
 * no-flash script as a `<script>` element inside a client component. React 19
 * warns about that on every client render — scripts in the React tree do not
 * execute after hydration — and the warning is a known, unfixed upstream issue
 * (pacocoursey/next-themes#385, #387) in a package with no release in over a
 * year. The available workarounds were third-party forks, which is a worse
 * trade on the first-paint path than fifty lines we understand.
 *
 * `useServerInsertedHTML` is the App Router's own mechanism for this: the
 * script goes into the SSR stream rather than into the component tree, so it
 * runs before first paint and never re-renders on the client.
 */
const SCRIPT = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"system";
var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
var e=document.documentElement;
e.classList.toggle("dark",d);
e.style.colorScheme=d?"dark":"light";
}catch(_){}})()`;

type ThemeContextValue = {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Read the stored choice. External state, so `useSyncExternalStore`. */
function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored as Theme) ? (stored as Theme) : "system";
  } catch {
    // Private mode, blocked storage. The page still works, just unremembered.
    return "system";
  }
}

/**
 * The server has no idea what the browser will resolve, so it says "system".
 * Anything else would be a guess that hydration then contradicts.
 */
function getServerSnapshot(): Theme {
  return "system";
}

function subscribe(onChange: () => void): () => void {
  // `storage` fires for other tabs; the custom event covers this one.
  const onStorage = () => {
    apply(getSnapshot());
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("dealio:theme", onChange);
  // When the OS flips while "system" is selected, the stored value has not
  // changed — so `getSnapshot` returns the same string and React re-renders
  // nothing. The class still has to move, so apply it here rather than relying
  // on a render that will not happen.
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    apply(getSnapshot());
    onChange();
  };
  media.addEventListener("change", onMedia);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("dealio:theme", onChange);
    media.removeEventListener("change", onMedia);
  };
}

function apply(theme: Theme): void {
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const element = document.documentElement;
  element.classList.toggle("dark", dark);
  // Tells the browser which built-in control colours to use — scrollbars,
  // form controls, the gap outside the page.
  element.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useServerInsertedHTML(() => <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />);

  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Unremembered, but still applied for this page.
    }
    apply(next);
    window.dispatchEvent(new Event("dealio:theme"));
  }, []);

  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}

/**
 * The stored preference, which is "system" rather than the resolved light or
 * dark. That is the honest answer to "what is set", and it is what a toggle
 * should tick.
 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return value;
}
