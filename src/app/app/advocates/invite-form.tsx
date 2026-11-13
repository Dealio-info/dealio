"use client";

import { useActionState, useState } from "react";
import { CheckIcon, CopyIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TERMS } from "@/lib/terms";
import { invite, type InviteState } from "./actions";

const INITIAL: InviteState = {};

/**
 * Invite someone, then show the link to send them.
 *
 * The link is shown once: only its hash is stored, so this response is the
 * only place the working URL ever exists. The copy says so, rather than letting
 * someone close the panel expecting to find it again later.
 */
export function InviteAdvocate() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(invite, INITIAL);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" />
        Invite an {TERMS.advocate.one}
      </Button>
    );
  }

  if (state.invitation) {
    return <InviteLink invitation={state.invitation} onDone={() => setOpen(false)} />;
  }

  return (
    <div className="bg-card w-full rounded-lg border p-5 sm:w-[28rem]">
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="dana@customer.com"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Name" placeholder="Dana Whitfield" />
          <Field name="company" label="Company" placeholder="Acme" />
        </div>
        <Field name="title" label="Title" placeholder="VP Engineering" />
        {state.error && (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating link…" : "Create invite link"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
}: {
  name: string;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`invite-${name}`}>
        {label} <span className="text-muted-foreground">(optional)</span>
      </Label>
      <Input
        id={`invite-${name}`}
        name={name}
        maxLength={200}
        placeholder={placeholder}
      />
    </div>
  );
}

/** The one-time link, with a copy button. Also used for re-issued links. */
export function InviteLink({
  invitation,
  onDone,
}: {
  invitation: NonNullable<InviteState["invitation"]>;
  onDone?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    // In a handler, not during render: `navigator` does not exist on the server.
    await navigator.clipboard.writeText(invitation.link);
    setCopied(true);
  }

  return (
    <div className="bg-card w-full space-y-3 rounded-lg border p-5 sm:w-[28rem]">
      <p className="font-medium">
        {invitation.reinvited ? "New link" : "Invite link"} for {invitation.email}
      </p>
      <p className="text-muted-foreground text-sm">
        Send this to them yourself. It works once, expires on{" "}
        {new Date(invitation.expiresAt).toLocaleDateString()}, and{" "}
        <strong className="text-foreground font-medium">will not be shown again</strong>
        {invitation.reinvited && " — any earlier link for them has stopped working"}.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={invitation.link} onFocus={(e) => e.target.select()} />
        <Button type="button" variant="outline" onClick={copy} aria-label="Copy link">
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        </Button>
      </div>
      {onDone && (
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Done
        </Button>
      )}
    </div>
  );
}
