"use client";

import type { MemberPageOutput, Role } from "@koklo/contract";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from "@koklo/ui";
import { useRef } from "react";
import { assignableRoles, ROLE_LABELS } from "../lib/roles.ts";
import { KEEP_BUTTON_ID } from "./member-removal.tsx";

export type MemberRow = MemberPageOutput["items"][number];

interface MemberActionsProps {
  member: MemberRow;
  actorRole: Role | undefined;
  onRole: (member: MemberRow, role: string) => void;
  onRemove: (member: MemberRow) => void;
}

/** Menu d'un membre : changer son rôle, ou le retirer. Absent sur sa propre ligne (décidé par l'appelant). */
export function MemberActions({ member, actorRole, onRole, onRemove }: MemberActionsProps) {
  // Le retrait ouvre une confirmation qui prend le focus : le menu ne le rend alors pas au déclencheur.
  const removing = useRef(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="ghost"
          icon="more_horiz"
          aria-label={`Actions pour ${member.name}`}
          className="size-11 md:size-9"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (!removing.current) return;
          event.preventDefault();
          removing.current = false;
          document.getElementById(KEEP_BUTTON_ID)?.focus();
        }}
      >
        <DropdownMenuLabel>Changer le rôle</DropdownMenuLabel>
        {assignableRoles(actorRole, member.role).map((role) => (
          <DropdownMenuItem key={role} onSelect={() => onRole(member, role)}>
            {ROLE_LABELS[role]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => {
            removing.current = true;
            onRemove(member);
          }}
        >
          Retirer de l'organisation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
