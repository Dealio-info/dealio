"use client";

import { useActionState, useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCY } from "@/lib/currency";
import { capitalize, QUEST_TYPE, TERMS } from "@/lib/terms";
import { createQuest, type QuestFormState } from "./actions";

const INITIAL: QuestFormState = {};

const TYPE_ITEMS = Object.entries(QUEST_TYPE).map(([value, t]) => ({
  value,
  label: t.label,
  hint: t.hint,
}));

export type AdvocateOption = { readonly id: string; readonly label: string };

/**
 * Ask an advocate for something.
 *
 * "Send now" is offered only when the approval policy lets this person send;
 * otherwise the one button saves a draft for an admin to approve, and says so.
 * The server decides either way — this only avoids offering a button that
 * would be refused.
 */
export function NewQuest({
  advocates,
  canSend,
}: {
  advocates: readonly AdvocateOption[];
  canSend: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Close on success from inside the action, not from an effect watching its
  // result: the submission is the event, and reacting to it in an effect
  // renders once with the stale "open" state first.
  const [state, formAction, pending] = useActionState(
    async (prev: QuestFormState, formData: FormData) => {
      const result = await createQuest(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={advocates.length === 0}>
        <PlusIcon className="size-4" />
        New {TERMS.quest.one}
      </Button>
    );
  }

  return (
    <div className="bg-card w-full rounded-lg border p-5 sm:w-[32rem]">
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{capitalize(TERMS.advocate.one)}</Label>
            <Select
              name="advocateId"
              required
              items={advocates.map((a) => ({ value: a.id, label: a.label }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {advocates.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              name="type"
              required
              defaultValue="REFERENCE_CALL"
              items={TYPE_ITEMS}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_ITEMS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quest-title">What you are asking</Label>
          <Input
            id="quest-title"
            name="title"
            required
            maxLength={200}
            placeholder="Reference call with Globex's CTO"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quest-description">
            Details <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="quest-description"
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="30 minutes next week. They want to hear how you rolled it out."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_8rem]">
          <div className="space-y-1.5">
            <Label htmlFor="quest-prospect">
              Prospect <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id="quest-prospect" name="prospectName" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quest-prospect-company">
              Their company <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input id="quest-prospect-company" name="prospectCompany" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quest-reward">Reward</Label>
            <Input
              id="quest-reward"
              name="rewardAmount"
              type="number"
              min={0}
              step={1}
              defaultValue={5}
              required
            />
            <p className="text-muted-foreground text-xs">In {CURRENCY.many}</p>
          </div>
        </div>

        {state.error && (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canSend ? (
            <>
              <Button type="submit" name="intent" value="send" disabled={pending}>
                Send to {TERMS.advocate.one}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="draft"
                variant="outline"
                disabled={pending}
              >
                Save draft
              </Button>
            </>
          ) : (
            <Button type="submit" name="intent" value="draft" disabled={pending}>
              Submit for approval
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
