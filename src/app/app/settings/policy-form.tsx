"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { saveApprovalPolicy, type PolicyState } from "./actions";

const INITIAL: PolicyState = {};

export type PolicySetting = {
  readonly name:
    "requireAdminApprovalForOpportunities" | "requireAdminApprovalForRewards";
  readonly label: string;
  readonly on: string;
  readonly off: string;
};

/**
 * The two approval switches, saved together with an explicit button.
 *
 * Not saved on toggle: this decides who may spend the business's money, and a
 * mis-tap should not take effect before anyone has read what it does. Each
 * switch says in words what its current position means, because "on" alone
 * does not say *who* is being required to do what.
 *
 * The values travel as hidden `"true"`/`"false"` inputs rather than relying
 * on the switch's own form participation, so the server sees an explicit
 * answer for both flags every time — an unchecked checkbox sends nothing, and
 * "nothing" is not the same as "off".
 */
export function PolicyForm({
  settings,
  initial,
  editable,
}: {
  settings: readonly PolicySetting[];
  initial: Readonly<Record<PolicySetting["name"], boolean>>;
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveApprovalPolicy, INITIAL);
  const [values, setValues] = useState(initial);
  const dirty = settings.some((s) => values[s.name] !== initial[s.name]);

  return (
    <form action={formAction} className="space-y-6">
      {settings.map((setting) => {
        const checked = values[setting.name];
        const id = `policy-${setting.name}`;
        return (
          <div key={setting.name} className="flex items-start justify-between gap-6">
            <div className="space-y-1">
              <label htmlFor={id} className="font-medium">
                {setting.label}
              </label>
              <p className="text-muted-foreground max-w-prose text-sm">
                {checked ? setting.on : setting.off}
              </p>
            </div>
            <input type="hidden" name={setting.name} value={String(checked)} />
            <Switch
              id={id}
              checked={checked}
              disabled={!editable || pending}
              onCheckedChange={(next) =>
                setValues((prev) => ({ ...prev, [setting.name]: next }))
              }
              className="mt-1"
            />
          </div>
        );
      })}

      {editable && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {state.ok && !dirty && (
            <p role="status" className="text-muted-foreground text-sm">
              Saved. Applies from the next action; nothing already done changes.
            </p>
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
