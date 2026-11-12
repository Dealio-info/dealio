"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { claimReward, type ClaimState } from "./actions";

const INITIAL: ClaimState = {};

/**
 * The claim control on one reward card.
 *
 * Shown even when the advocate cannot afford it, disabled — the card already
 * says how far off they are, and a missing button reads as "not available"
 * rather than "not yet". Affordability is still decided on the server; this is
 * only what the person sees.
 */
export function ClaimButton({
  businessId,
  rewardId,
  affordable,
}: {
  businessId: string;
  rewardId: string;
  affordable: boolean;
}) {
  const [state, formAction, pending] = useActionState(claimReward, INITIAL);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="rewardId" value={rewardId} />
      <Button type="submit" size="sm" disabled={pending || !affordable}>
        {pending ? "Claiming…" : "Claim"}
      </Button>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
