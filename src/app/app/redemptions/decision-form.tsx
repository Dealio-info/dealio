"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideRedemption, type DecisionState } from "./actions";

const INITIAL: DecisionState = {};

/**
 * The controls on one redemption.
 *
 * A real `<form>` with a server action, so the decision that spends money
 * works without JavaScript and cannot be half-submitted by a stale client.
 *
 * Declining asks for a reason first. The advocate sees whatever is typed here,
 * and "Declined" with nothing after it is the kind of silence that loses an
 * advocate — but it stays optional, because forcing a sentence just produces
 * "n/a".
 */
export function DecisionForm({
  redemptionId,
  status,
}: {
  redemptionId: string;
  status: string;
}) {
  const [state, formAction, pending] = useActionState(decideRedemption, INITIAL);
  const [declining, setDeclining] = useState(false);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="redemptionId" value={redemptionId} />

      {status === "REQUESTED" && !declining && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="submit"
            name="decision"
            value="approve"
            size="sm"
            disabled={pending}
          >
            Approve
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setDeclining(true)}
          >
            Decline
          </Button>
        </div>
      )}

      {status === "REQUESTED" && declining && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Input
            name="reason"
            placeholder="Why, for the advocate (optional)"
            className="w-64"
            maxLength={500}
          />
          <Button
            type="submit"
            name="decision"
            value="reject"
            variant="outline"
            size="sm"
            disabled={pending}
          >
            Confirm decline
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDeclining(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      {status === "APPROVED" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Input
            name="externalOrderId"
            placeholder="Order reference (optional)"
            className="w-48"
            maxLength={200}
          />
          <Button
            type="submit"
            name="decision"
            value="delivered"
            variant="outline"
            size="sm"
            disabled={pending}
          >
            Mark sent
          </Button>
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
