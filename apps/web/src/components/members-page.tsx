"use client";

import { InlineAlert } from "@koklo/ui";
import { useState } from "react";
import { canListMembers, canManage } from "../lib/roles.ts";
import { useActiveOrganization } from "../lib/use-active-organization.ts";
import { InviteForm } from "./invite-form.tsx";
import { MembersList } from "./members-list.tsx";
import { PendingInvitations } from "./pending-invitations.tsx";
import { RoleMatrix } from "./role-matrix.tsx";
import { SectionHeading } from "./section-heading.tsx";

const READ_ONLY =
  "Lecture seule : seuls les propriétaires et les administrateurs modifient cette section.";

function TeamOnlyNotice() {
  return (
    <InlineAlert variant="neutral" icon="lock">
      La liste des membres est réservée à l'équipe.
    </InlineAlert>
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
    <div data-testid="members-page" className="flex flex-col gap-5">
      <SectionHeading
        title="Membres"
        description="Les personnes de l'organisation et leur rôle. Les clients n'y voient que leurs projets ; les agents ne sont jamais des membres."
      />
      {role && !manage ? (
        <InlineAlert variant="neutral" icon="lock">
          {READ_ONLY}
        </InlineAlert>
      ) : null}
      {notice ? (
        <InlineAlert variant="success" icon="check_circle">
          {notice}
        </InlineAlert>
      ) : null}
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
