"use client";

import { memberRoleSchema } from "@koklo/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { MemberRow } from "../components/member-actions.tsx";
import { conflictReason } from "./api-error.ts";
import { MEMBERS_COPY } from "./members-labels.ts";
import { orpc } from "./orpc.ts";
import { ROLE_LABELS } from "./roles.ts";

export interface MemberFailure {
  title: string;
  text: string;
}

/** Changements d'un membre (rôle, retrait) : annonce du succès, échec nommé, confirmation du retrait en cours. */
export function useMemberChanges(onNotice: (text: string | undefined) => void) {
  const queryClient = useQueryClient();
  const updateRole = useMutation(orpc.member.updateRole.mutationOptions());
  const remove = useMutation(orpc.member.remove.mutationOptions());
  const [removing, setRemoving] = useState<MemberRow>();
  const [failure, setFailure] = useState<MemberFailure>();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.member.key() });

  function fail(title: string, error: unknown): void {
    const lastOwner = conflictReason(error) === "last_owner";
    setFailure({ title, text: lastOwner ? MEMBERS_COPY.lastOwner : "Réessayez dans un instant." });
  }

  function changeRole(member: MemberRow, role: string): void {
    const parsed = memberRoleSchema.safeParse(role);
    if (!parsed.success) return;
    onNotice(undefined);
    setFailure(undefined);
    updateRole.mutate(
      { memberId: member.id, role: parsed.data },
      {
        onSuccess: () => {
          onNotice(`Rôle de ${member.name} : ${ROLE_LABELS[parsed.data]}`);
          refresh();
        },
        onError: (error) => fail(MEMBERS_COPY.roleFailed, error),
      },
    );
  }

  function confirmRemoval(): void {
    if (!removing) return;
    const member = removing;
    onNotice(undefined);
    setFailure(undefined);
    remove.mutate(
      { memberId: member.id },
      {
        onSuccess: () => {
          setRemoving(undefined);
          onNotice(`${member.name} a été retiré.`);
          refresh();
        },
        onError: (error) => {
          setRemoving(undefined);
          fail(MEMBERS_COPY.removeFailed, error);
        },
      },
    );
  }

  return {
    changeRole,
    confirmRemoval,
    removing,
    askRemoval: setRemoving,
    keep: () => setRemoving(undefined),
    removePending: remove.isPending,
    failure,
  };
}
