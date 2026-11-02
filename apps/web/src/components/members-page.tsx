"use client";

import type { MemberListOutput } from "@koklo/contract";
import {
  Alert,
  AlertDescription,
  Badge,
  Icon,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { GENERIC_ERROR } from "../lib/form-errors.ts";
import { orpc } from "../lib/orpc.ts";
import { canListMembers, canManage, ROLE_LABELS } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { InviteForm } from "./invite-form.tsx";
import { LoadingStatus } from "./loading-status.tsx";

function MembersTable({ members }: { members: MemberListOutput }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">
        {members.length === 1 ? "1 membre" : `${members.length} membres`}
      </p>
      <Table>
        <TableCaption className="sr-only">Liste des membres</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Membre</TableHead>
            <TableHead>Rôle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{member.name}</span>
                  <span className="text-[13px] text-muted-foreground">{member.email}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReadOnlyNotice() {
  return (
    <Alert className="max-w-xl">
      <Icon name="lock" size={20} />
      <AlertDescription>
        Seuls les propriétaires et les administrateurs peuvent inviter des membres.
      </AlertDescription>
    </Alert>
  );
}

function TeamOnlyNotice() {
  return (
    <Alert className="max-w-xl">
      <Icon name="lock" size={20} />
      <AlertDescription>La liste des membres est réservée à l'équipe.</AlertDescription>
    </Alert>
  );
}

/** Membres de l'organisation active : invitation (managers) et liste. */
export function MembersPage() {
  const { role, organizations, session, activeId } = useActiveOrganization();
  const roleKnown = !organizations.isPending && !session.isPending;
  const allowed = canListMembers(role);
  // Pas d'appel tant que le rôle n'est pas établi, ni s'il reste inconnu (`organization.list` en
  // échec, organisation active absente) : un rôle inconnu vaut non autorisé, jamais un 403 déclenché.
  // Sans organisation active, l'api répond 401 (jamais de donnée) : l'appel déclenche la redirection
  // vers /organizations.
  const members = useQuery({
    ...orpc.member.list.queryOptions(),
    enabled: roleKnown && (allowed || !activeId),
  });
  const redirecting = useUnauthorizedRedirect(members.error);

  let list = <LoadingStatus label="Chargement des membres…" />;
  if (roleKnown && !allowed && activeId) list = <TeamOnlyNotice />;
  else if (members.data) list = <MembersTable members={members.data} />;
  else if (members.isError && !members.isFetching && !redirecting) {
    list = (
      <ErrorNotice title="Impossible de charger les membres" onRetry={() => void members.refetch()}>
        {GENERIC_ERROR}
      </ErrorNotice>
    );
  }

  // Tant que le rôle est inconnu, ni formulaire ni message : on évite un faux « droits insuffisants ».
  let invitation = null;
  if (role && allowed)
    invitation = canManage(role) ? <InviteForm role={role} /> : <ReadOnlyNotice />;

  return (
    <div data-testid="members-page" className="flex flex-col gap-6">
      <h1 className="text-[30px] font-semibold tracking-[-0.025em]">Membres</h1>
      {invitation}
      {list}
    </div>
  );
}
