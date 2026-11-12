"use client";

import { useActionState, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY } from "@/lib/currency";
import { addReward, editReward, type CatalogState } from "./actions";

const INITIAL: CatalogState = {};

/**
 * Add a reward, or edit one.
 *
 * The same fields either way, so the same component — an edit form that drifts
 * from the create form is how a field ends up editable in one place and not
 * the other.
 *
 * Adding collapses behind a button because the catalog, not the form, is what
 * someone opens this page to look at.
 */
export function RewardForm({
  reward,
  onDone,
}: {
  reward?: { id: string; name: string; description: string | null; cost: number };
  onDone?: () => void;
}) {
  const editing = reward !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? editReward : addReward,
    INITIAL,
  );

  // In an effect, not during render: calling the parent's setter while
  // rendering this component is the "cannot update a component while
  // rendering a different component" error, and React is right about it.
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {editing && <input type="hidden" name="rewardId" value={reward.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1.5">
          <Label htmlFor={`name-${reward?.id ?? "new"}`}>Name</Label>
          <Input
            id={`name-${reward?.id ?? "new"}`}
            name="name"
            defaultValue={reward?.name}
            placeholder="$25 coffee card"
            required
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`cost-${reward?.id ?? "new"}`}>Cost</Label>
          <Input
            id={`cost-${reward?.id ?? "new"}`}
            name="cost"
            type="number"
            min={0}
            step={1}
            defaultValue={reward?.cost ?? 5}
            required
          />
          <p className="text-muted-foreground text-xs">In {CURRENCY.many}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`description-${reward?.id ?? "new"}`}>
          Description <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={`description-${reward?.id ?? "new"}`}
          name="description"
          defaultValue={reward?.description ?? ""}
          placeholder="Delivered by email within two working days"
          rows={2}
          maxLength={2000}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {editing ? "Save changes" : "Add reward"}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** The add form, hidden until wanted. */
export function AddReward() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" />
        Add reward
      </Button>
    );
  }
  return (
    <div className="bg-card w-full rounded-lg border p-5">
      <RewardForm onDone={() => setOpen(false)} />
    </div>
  );
}
