"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
 * Styling is deliberately plain. `ui.shadcn.com` is outside this environment's
 * allowed network domains, so `input` and `label` could not be generated —
 * swap these for the shadcn components when that is unblocked.
 */
export function SignInForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("magic-link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
    safeRedirectPath(next),
  )}`;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("working");

    const supabase = supabaseBrowser();

    if (mode === "magic-link") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
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
      options: { redirectTo },
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

  const inputClass =
    "border-input bg-background w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      {mode === "password" && (
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
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
