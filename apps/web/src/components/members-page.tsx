"use client";

import { Alert, AlertDescription, Icon } from "@koklo/ui";
import { useState } from "react";
import { canListMembers, canManage } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { InviteForm } from "./invite-form.tsx";
import { MembersList } from "./members-list.tsx";
import { PendingInvitations } from "./pending-invitations.tsx";
import { RoleMatrix } from "./role-matrix.tsx";

function TeamOnlyNotice() {
  return (
    <Alert className="max-w-xl">
      <Icon name="lock" size={20} />
      <AlertDescription>La liste des membres est réservée à l'équipe.</AlertDescription>
    </Alert>
  );
}

/** Membres de l'organisation active : invitation, tableau paginé, invitations en attente, matrice des rôles. */
export function MembersPage() {
  const { role, organizations, session, activeId } = useActiveOrganization();
  const [notice, setNotice] = useState<string>();
  const roleKnown = !organizations.isPending && !session.isPending;
  const allowed = canListMembers(role);
  const manage = canManage(role);
  // Pas d'appel tant que le rôle n'est pas établi, ni s'il reste inconnu (`organization.list` en échec,
  // organisation active absente) : un rôle inconnu vaut non autorisé, jamais un 403 déclenché. Sans
  // organisation active, l'api répond 401 : l'appel déclenche la redirection vers /organizations.
  const enabled = roleKnown && (allowed || !activeId);
  const teamOnly = roleKnown && !allowed && Boolean(activeId);

  return (
    <div data-testid="members-page" className="flex flex-col gap-6">
      <h2 className="text-section-title">Membres</h2>
      <div role="status" className="empty:hidden">
        {notice}
      </div>
      {role && manage ? <InviteForm role={role} /> : null}
      {teamOnly ? (
        <TeamOnlyNotice />
      ) : (
        <MembersList enabled={enabled} role={role} manage={manage} onNotice={setNotice} />
      )}
      {manage ? <PendingInvitations onNotice={setNotice} /> : null}
      {allowed ? <RoleMatrix /> : null}
    </div>
  );
}
