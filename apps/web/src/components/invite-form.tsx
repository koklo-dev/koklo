"use client";

import { type MemberInviteOutput, memberInviteInputSchema, type Role } from "@koklo/contract";
import { Alert, AlertDescription, AlertTitle, Button, Card, Icon } from "@koklo/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { conflictReason, errorCode } from "../lib/api-error.ts";
import { fieldErrors, RETRY_LATER } from "../lib/form-errors.ts";
import { orpc } from "../lib/orpc.ts";
import { invitableRoles, ROLE_LABELS } from "../lib/roles.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { FormField } from "./form-field.tsx";
import { RoleField } from "./role-field.tsx";

const MESSAGES = {
  email: { default: "Saisissez une adresse e-mail valide, par exemple nom@exemple.fr." },
  role: { default: "Choisissez un rôle." },
};
const CONFLICTS: Record<string, string> = {
  already_member: "Cette personne fait déjà partie de l'organisation.",
  already_invited: "Cette personne a déjà une invitation en attente.",
};
const longDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

/** Confirmation honnête (G3) : l'invitation est créée, l'e-mail part en arrière-plan. */
function Created({ invitation }: { invitation: MemberInviteOutput }) {
  return (
    <Alert>
      <Icon name="check_circle" size={20} />
      <AlertTitle>Invitation créée</AlertTitle>
      <AlertDescription>
        {`${invitation.email} est invité comme ${ROLE_LABELS[invitation.role]} jusqu'au ${longDate.format(new Date(invitation.expiresAt))}. L'e-mail part en arrière-plan.`}
      </AlertDescription>
    </Alert>
  );
}

function InviteFailure({ error }: { error: unknown }) {
  if (errorCode(error) === "FORBIDDEN") {
    return (
      <ErrorNotice icon="lock">
        Vous n'avez pas le droit d'inviter ce rôle. Seul un propriétaire peut inviter un
        administrateur.
      </ErrorNotice>
    );
  }
  return <ErrorNotice title="L'invitation n'a pas pu être créée">{RETRY_LATER}</ErrorNotice>;
}

function useInviteForm() {
  const invite = useMutation(orpc.member.invite.mutationOptions());
  const emailInput = useRef<HTMLInputElement>(null);
  const roleTrigger = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<MemberInviteOutput>();

  function submit(event: FormEvent): void {
    event.preventDefault();
    setCreated(undefined);
    const parsed = memberInviteInputSchema.safeParse({ email: email.trim(), role: memberRole });
    const found = parsed.success ? {} : fieldErrors(parsed.error.issues, MESSAGES);
    setErrors(found);
    if (!parsed.success) {
      (found.email ? emailInput : roleTrigger).current?.focus();
      return;
    }
    invite.mutate(parsed.data, {
      onSuccess: (invitation) => {
        setCreated(invitation);
        setEmail("");
        setMemberRole("");
        emailInput.current?.focus();
      },
      onError: (error) => {
        const conflict = CONFLICTS[conflictReason(error) ?? ""];
        if (conflict) setErrors({ email: conflict });
      },
    });
  }

  /** Toute nouvelle saisie efface la confirmation précédente. */
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setCreated(undefined);
    };
  const isConflict = invite.isError && CONFLICTS[conflictReason(invite.error) ?? ""] !== undefined;
  return {
    submit,
    emailInput,
    roleTrigger,
    email,
    setEmail: edit(setEmail),
    memberRole,
    setMemberRole: edit(setMemberRole),
    errors,
    created,
    pending: invite.isPending,
    failure: invite.isError && !isConflict ? { error: invite.error } : undefined,
  };
}

/** Invitation d'un membre (e-mail + rôle) ; réservée aux propriétaires et administrateurs. */
export function InviteForm({ role }: { role: Role }) {
  const form = useInviteForm();
  return (
    <Card className="flex max-w-xl flex-col gap-4 p-5">
      <h2 className="text-base font-semibold tracking-[-0.015em]">Inviter un membre</h2>
      <form onSubmit={form.submit} noValidate className="flex flex-col gap-4">
        {form.failure ? <InviteFailure error={form.failure.error} /> : null}
        <FormField
          ref={form.emailInput}
          type="email"
          label="Adresse e-mail"
          value={form.email}
          onChange={(event) => form.setEmail(event.target.value)}
          readOnly={form.pending}
          error={form.errors.email}
          autoComplete="off"
        />
        <RoleField
          roles={invitableRoles(role)}
          value={form.memberRole}
          onValueChange={form.setMemberRole}
          disabled={form.pending}
          error={form.errors.role}
          triggerRef={form.roleTrigger}
        />
        <Button
          type="submit"
          className="h-11 w-full md:h-9 md:w-fit"
          disabled={form.pending}
          aria-busy={form.pending}
        >
          {form.pending ? "Invitation…" : "Inviter"}
        </Button>
      </form>
      {form.created ? <Created invitation={form.created} /> : null}
    </Card>
  );
}
