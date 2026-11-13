"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvite, type ClaimState } from "./actions";

const INITIAL: ClaimState = {};

export function AcceptForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptInvite, INITIAL);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Accepting…" : "Accept invitation"}
      </Button>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
