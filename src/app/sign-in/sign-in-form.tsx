"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { safeRedirectPath } from "@/lib/safe-redirect";

type Mode = "magic-link" | "password";

/**
 * Hybrid sign-in: a magic link by default, with a password and Google also
 * available.
 *
 * Magic link leads because advocates sign in rarely and a password they set
 * once and forget is friction that costs participation. Reps who use Dealio
 * daily will want the password or Google.
 *
 * Note this is a client component that still renders on the server. `"use
 * client"` means "ships to the browser too", not "browser only", so nothing
 * here may touch `window` during render — see `callbackUrl` below.
 */
export function SignInForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("magic-link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  /**
   * Where Supabase sends people back to.
   *
   * Built inside the handlers rather than during render, because this
   * component renders on the server first and `window` does not exist there —
   * reading it at the top level crashed the page before anyone could type an
   * address.
   *
   * It uses the live origin rather than a configured URL so a preview
   * deployment sends people back to itself.
   */
  function callbackUrl() {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      safeRedirectPath(next),
    )}`;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("working");

    const supabase = supabaseBrowser();

    if (mode === "magic-link") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) {
        setError(error.message);
        setStatus("idle");
        return;
      }
      setStatus("sent");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setStatus("idle");
      return;
    }
    window.location.assign(safeRedirectPath(next));
  }

  async function handleGoogle() {
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) setError(error.message);
  }

  if (status === "sent") {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-medium">Check your email</h2>
        <p className="text-muted-foreground text-sm">
          We sent a sign-in link to <strong>{email}</strong>. It expires shortly.
        </p>
        <Button variant="ghost" onClick={() => setStatus("idle")}>
          Use a different address
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {mode === "password" && (
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Button type="submit" disabled={status === "working"} className="w-full">
        {mode === "magic-link" ? "Email me a sign-in link" : "Sign in"}
      </Button>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={handleGoogle}>
          Continue with Google
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setMode(mode === "magic-link" ? "password" : "magic-link")}
        >
          {mode === "magic-link" ? "Use a password instead" : "Email me a link instead"}
        </Button>
      </div>
    </form>
  );
}
