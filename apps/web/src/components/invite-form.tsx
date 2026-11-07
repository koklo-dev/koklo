"use client";

import { type InvitationListOutput, invitationCreateInputSchema, type Role } from "@koklo/contract";
import { Alert, AlertDescription, AlertTitle, Button, Card, Icon } from "@koklo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { conflictReason, errorCode } from "../lib/api-error.ts";
import { fieldErrors, RETRY_LATER } from "../lib/form-errors.ts";
import { MEMBERS_COPY, needsProjects } from "../lib/members-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { invitableRoles, ROLE_LABELS } from "../lib/roles.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { FormField } from "./form-field.tsx";
import { InviteProjectsField } from "./invite-projects-field.tsx";
import { RoleField } from "./role-field.tsx";

const MESSAGES = {
  email: { default: "Saisissez une adresse e-mail valide, par exemple nom@exemple.fr." },
  role: { default: "Choisissez un rôle." },
};
const CONFLICTS: Record<string, string> = {
  already_member: "Cette personne fait déjà partie de l'organisation.",
  already_invited: "Cette personne a déjà une invitation en attente.",
};
type Invitation = InvitationListOutput[number];
const longDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

/** Confirmation honnête (G3) : l'invitation est créée, l'e-mail part en arrière-plan. */
function Created({ invitation }: { invitation: Invitation }) {
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

/** Valide la saisie avec le schéma du contrat ; client et business doivent aussi avoir un projet (B98). */
function validateInvite(email: string, role: string, projectIds: string[]) {
  const withProjects = needsProjects(role);
  const parsed = invitationCreateInputSchema.safeParse({
    email: email.trim(),
    role,
    ...(withProjects ? { projectIds } : {}),
  });
  const found = parsed.success ? {} : fieldErrors(parsed.error.issues, MESSAGES);
  if (parsed.success && withProjects && projectIds.length === 0) {
    return { found: { projects: MEMBERS_COPY.projectsRequired } };
  }
  return parsed.success ? { data: parsed.data, found } : { found };
}

/** Saisie du formulaire ; toute modification efface la confirmation précédente. */
function useInviteFields(clearCreated: () => void) {
  const [email, setEmail] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      clearCreated();
    };
  return {
    email,
    memberRole,
    projectIds,
    setEmail: edit(setEmail),
    setMemberRole: edit(setMemberRole),
    setProjectIds: edit(setProjectIds),
    clear: () => {
      setEmail("");
      setMemberRole("");
      setProjectIds([]);
    },
  };
}

function useInviteForm() {
  const queryClient = useQueryClient();
  const invite = useMutation(orpc.invitation.create.mutationOptions());
  const emailInput = useRef<HTMLInputElement>(null);
  const roleTrigger = useRef<HTMLButtonElement>(null);
  const projectsFilter = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Invitation>();
  const fields = useInviteFields(() => setCreated(undefined));

  function submit(event: FormEvent): void {
    event.preventDefault();
    setCreated(undefined);
    const { data, found } = validateInvite(fields.email, fields.memberRole, fields.projectIds);
    setErrors(found);
    if (!data) {
      const firstInvalid = found.email ? emailInput : found.role ? roleTrigger : projectsFilter;
      firstInvalid.current?.focus();
      return;
    }
    invite.mutate(data, {
      onSuccess: (invitation) => {
        setCreated(invitation);
        fields.clear();
        emailInput.current?.focus();
        void queryClient.invalidateQueries({ queryKey: orpc.invitation.key() });
      },
      onError: (error) => {
        const conflict = CONFLICTS[conflictReason(error) ?? ""];
        if (conflict) setErrors({ email: conflict });
      },
    });
  }

  const isConflict = invite.isError && CONFLICTS[conflictReason(invite.error) ?? ""] !== undefined;
  return {
    ...fields,
    submit,
    emailInput,
    roleTrigger,
    projectsFilter,
    errors,
    created,
    pending: invite.isPending,
    failure: invite.isError && !isConflict ? { error: invite.error } : undefined,
  };
}

/** Invitation d'un membre (e-mail, rôle, projets) ; réservée aux propriétaires et administrateurs. */
export function InviteForm({ role }: { role: Role }) {
  const form = useInviteForm();
  return (
    <Card className="flex max-w-xl flex-col gap-4 p-5">
      <h3 className="text-subsection-title">Inviter un membre</h3>
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
        {needsProjects(form.memberRole) ? (
          <InviteProjectsField
            selected={form.projectIds}
            onChange={form.setProjectIds}
            disabled={form.pending}
            error={form.errors.projects}
            focusRef={form.projectsFilter}
          />
        ) : null}
        <p className="text-meta text-muted-foreground">{MEMBERS_COPY.invitePhrase}</p>
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
