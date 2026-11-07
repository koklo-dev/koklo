"use client";

import type { InvitationListOutput } from "@koklo/contract";
import { Badge, Button } from "@koklo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { formatShortDate, MEMBERS_COPY } from "../lib/members-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { ROLE_LABELS } from "../lib/roles.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { LoadingStatus } from "./loading-status.tsx";

type Invitation = InvitationListOutput[number];

function Meta({ invitation }: { invitation: Invitation }) {
  const projects = invitation.projects.map((project) => project.name).join(", ");
  return (
    <span className="text-meta text-muted-foreground">
      {`Invitée par ${invitation.invitedBy} · expire le ${formatShortDate(invitation.expiresAt)}`}
      {projects ? ` · ${projects}` : ""}
    </span>
  );
}

interface RowProps {
  invitation: Invitation;
  busy: boolean;
  onResend: (invitation: Invitation) => void;
  onRevoke: (invitation: Invitation) => void;
}

function PendingRow({ invitation, busy, onResend, onRevoke }: RowProps) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dashed border-border-strong p-3">
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          <span className="break-all">{invitation.email}</span>
          <Badge variant="outline">{ROLE_LABELS[invitation.role]}</Badge>
        </span>
        <Meta invitation={invitation} />
      </div>
      <div className="flex w-full gap-2 md:w-auto">
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 md:h-9 md:flex-none"
          disabled={busy}
          aria-label={`Renvoyer l'invitation à ${invitation.email}`}
          onClick={() => onResend(invitation)}
        >
          Renvoyer
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 flex-1 md:h-9 md:flex-none"
          disabled={busy}
          aria-label={`Annuler l'invitation à ${invitation.email}`}
          onClick={() => onRevoke(invitation)}
        >
          Annuler
        </Button>
      </div>
    </li>
  );
}

type Mutate = (
  input: { invitationId: string },
  options: { onSuccess: () => void; onError: () => void },
) => void;

function usePendingActions(onNotice: (text: string | undefined) => void) {
  const queryClient = useQueryClient();
  const resend = useMutation(orpc.invitation.resend.mutationOptions());
  const revoke = useMutation(orpc.invitation.revoke.mutationOptions());
  const [failed, setFailed] = useState(false);
  const run = (mutate: Mutate, invitation: Invitation, notice: string) => {
    onNotice(undefined);
    setFailed(false);
    mutate(
      { invitationId: invitation.id },
      {
        onSuccess: () => {
          onNotice(notice);
          void queryClient.invalidateQueries({ queryKey: orpc.invitation.key() });
        },
        onError: () => setFailed(true),
      },
    );
  };
  return {
    failed,
    busy: resend.isPending || revoke.isPending,
    resend: (invitation: Invitation) =>
      run(resend.mutate, invitation, `Invitation renvoyée à ${invitation.email}.`),
    revoke: (invitation: Invitation) =>
      run(revoke.mutate, invitation, `Invitation à ${invitation.email} annulée.`),
  };
}

/** Invitations en attente (`invitation.list`) : Renvoyer et Annuler, réservées aux gestionnaires. */
export function PendingInvitations({ onNotice }: { onNotice: (text: string | undefined) => void }) {
  const list = useQuery(orpc.invitation.list.queryOptions());
  const actions = usePendingActions(onNotice);
  let body = <LoadingStatus label="Chargement des invitations…" rows={2} />;
  if (list.isError && !list.data) {
    body = (
      <ErrorNotice
        title="Impossible de charger les invitations"
        onRetry={() => void list.refetch()}
      >
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  } else if (list.data?.length === 0) {
    body = <p className="text-meta text-muted-foreground">Aucune invitation en attente.</p>;
  } else if (list.data) {
    body = (
      <ul className="flex flex-col gap-2">
        {list.data.map((invitation) => (
          <PendingRow
            key={invitation.id}
            invitation={invitation}
            busy={actions.busy}
            onResend={actions.resend}
            onRevoke={actions.revoke}
          />
        ))}
      </ul>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-subsection-title">
        {`Invitations en attente${list.data ? ` · ${list.data.length}` : ""}`}
      </h3>
      {actions.failed ? (
        <ErrorNotice title={MEMBERS_COPY.actionFailed}>Réessayez dans un instant.</ErrorNotice>
      ) : null}
      {body}
    </section>
  );
}
