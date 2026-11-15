"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/currency";
import { TERMS } from "@/lib/terms";
import type { BusinessVerb } from "@/server/services/opportunities/business-verbs";
import { actOnQuest, type QuestFormState } from "./actions";

const INITIAL: QuestFormState = {};

/**
 * The buttons on one quest, business side.
 *
 * Which verbs appear is decided on the server from `canTransition` and passed
 * in; this component only lays them out. Two of them take a second step:
 *
 * - **Verify** opens a field for influenced revenue. Optional, in dollars,
 *   because that is how people think about deal size; stored as cents.
 * - **Cancel** asks once more. It is terminal — nothing comes back from
 *   `CANCELLED` — and it sits next to buttons that are not.
 */
export function QuestControls({
  opportunityId,
  verbs,
  rewardAmount,
}: {
  opportunityId: string;
  verbs: readonly BusinessVerb[];
  rewardAmount: number;
}) {
  const [state, formAction, pending] = useActionState(actOnQuest, INITIAL);
  const [step, setStep] = useState<"idle" | "verify" | "cancel">("idle");

  if (verbs.length === 0) return null;

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="opportunityId" value={opportunityId} />

      {step === "verify" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`revenue-${opportunityId}`}>
              Influenced revenue{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`revenue-${opportunityId}`}
              name="revenue"
              inputMode="decimal"
              placeholder="$12,500"
              className="w-40"
            />
          </div>
          <Button type="submit" name="verb" value="verify" size="sm" disabled={pending}>
            Confirm verified
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStep("idle")}
          >
            Back
          </Button>
        </div>
      )}

      {step === "cancel" && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm">
            Cancel this {TERMS.quest.one}? It cannot be reopened.
          </p>
          <Button
            type="submit"
            name="verb"
            value="cancel"
            variant="destructive"
            size="sm"
            disabled={pending}
          >
            Yes, cancel it
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStep("idle")}
          >
            Keep it
          </Button>
        </div>
      )}

      {step === "idle" && (
        // A nested row: `CardContent` is a column, and buttons placed directly
        // in it stretch full width.
        <div className="flex flex-wrap gap-2">
          {verbs.includes("send") && (
            <Button type="submit" name="verb" value="send" size="sm" disabled={pending}>
              Approve and send
            </Button>
          )}
          {verbs.includes("verify") && (
            <Button type="button" size="sm" onClick={() => setStep("verify")}>
              Verify
            </Button>
          )}
          {verbs.includes("award") && (
            <Button
              type="submit"
              name="verb"
              value="award"
              size="sm"
              disabled={pending}
            >
              Award {formatCurrency(rewardAmount)}
            </Button>
          )}
          {verbs.includes("cancel") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep("cancel")}
            >
              Cancel
            </Button>
          )}
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
