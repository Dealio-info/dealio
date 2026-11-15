"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { invite, type InviteState } from "./actions";
import { InviteLink } from "./invite-form";

const INITIAL: InviteState = {};

/**
 * For someone invited who has not accepted: make a fresh link.
 *
 * The same action as inviting, since re-inviting an unclaimed address is
 * exactly what `inviteAdvocate` does — it expires the old link and issues a new
 * one. Needed because the first link was shown once and may be long gone.
 */
export function ReissueButton({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(invite, INITIAL);

  if (state.invitation) return <InviteLink invitation={state.invitation} />;

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        New link
      </Button>
      {state.error && (
        <p role="alert" className="text-destructive text-xs">
          {state.error}
        </p>
      )}
    </form>
  );
}
