"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { respondToQuest, type RespondState } from "./actions";

const INITIAL: RespondState = {};

/**
 * The buttons on one request.
 *
 * A real `<form>` with a server action, so it works before hydration and
 * without JavaScript — which matters more here than on the business side,
 * since an advocate arrives from an email link, often on a phone, and may
 * never visit twice.
 *
 * `useActionState` carries the error back inline instead of throwing it into
 * an error boundary: "someone already cancelled this" is information, not a
 * crash.
 */
export function QuestActions({
  businessId,
  opportunityId,
  options,
}: {
  businessId: string;
  opportunityId: string;
  options: ReadonlyArray<{
    value: "accept" | "decline" | "complete";
    label: string;
    variant?: "default" | "outline";
  }>;
}) {
  const [state, formAction, pending] = useActionState(respondToQuest, INITIAL);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="submit"
            name="response"
            value={option.value}
            variant={option.variant ?? "default"}
            size="sm"
            disabled={pending}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
