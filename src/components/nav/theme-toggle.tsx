"use client";

import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const;

/**
 * Light, dark, or whatever the OS says.
 *
 * The trigger shows both icons and lets CSS pick, rather than choosing in
 * JavaScript. The server cannot know which theme the browser will resolve —
 * that comes from localStorage and a media query — so rendering one icon means
 * a hydration mismatch, and the usual `mounted` flag fixes it by rendering the
 * wrong thing first. The `.dark` class is already on `<html>` before React
 * hydrates, so CSS has the answer when JavaScript does not.
 *
 * The menu's checkmark needs no such care: the content only mounts when opened,
 * which is always after hydration. It marks the stored preference rather than
 * the resolved one — with "System" chosen, that is the honest answer.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Change theme">
            <SunIcon className="size-4 dark:hidden" />
            <MoonIcon className="hidden size-4 dark:block" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            aria-current={theme === value ? "true" : undefined}
          >
            <Icon className="size-4" />
            {label}
            {theme === value && (
              <span className="text-muted-foreground ml-auto text-xs" aria-hidden>
                ✓
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
