"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/app/currency-amount";
import { toggleReward, type CatalogState } from "./actions";
import { RewardForm } from "./reward-form";

const INITIAL: CatalogState = {};

export type CatalogReward = {
  id: string;
  name: string;
  description: string | null;
  cost: number;
  isActive: boolean;
};

/**
 * One reward in the catalog, with its controls.
 *
 * Withdrawn rewards stay listed rather than disappearing, dimmed and offering
 * "Restore". A business that takes something off the catalog has not deleted
 * it — past redemptions still point at it — so hiding it entirely would
 * misrepresent what happened and leave no way back.
 */
export function RewardRow({ reward }: { reward: CatalogReward }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(toggleReward, INITIAL);

  if (editing) {
    return (
      <div className="bg-card rounded-lg border p-5">
        <RewardForm reward={reward} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className={reward.isActive ? "font-medium" : "text-muted-foreground"}>
            {reward.name}
            {!reward.isActive && (
              <span className="text-muted-foreground ml-2 text-xs">Withdrawn</span>
            )}
          </p>
          {reward.description && (
            <p className="text-muted-foreground max-w-prose text-sm">
              {reward.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <CurrencyAmount amount={reward.cost} />
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <form action={formAction}>
            <input type="hidden" name="rewardId" value={reward.id} />
            <input
              type="hidden"
              name="isActive"
              value={reward.isActive ? "false" : "true"}
            />
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              {reward.isActive ? "Withdraw" : "Restore"}
            </Button>
          </form>
        </div>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {state.error}
        </p>
      )}
    </div>
  );
}
