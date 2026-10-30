"use client";

import type { TicketStatus } from "@koklo/contract";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { errorCode } from "./api-error.ts";
import type { MoveFailure } from "./kanban-failure.ts";
import { orpc } from "./orpc.ts";
import { STATUS_LABELS } from "./ticket-labels.ts";

/** Demande de focus sur le bouton « Déplacer » d'un ticket ; l'identité de l'objet fait le signal. */
export interface FocusRequest {
  key: string;
}

/**
 * Déplacement d'un ticket, non optimiste : la carte change de colonne quand le serveur a répondu et que
 * le tableau est rechargé. Garde l'annonce, le refus à afficher et le focus à rendre.
 */
export function useTicketMove(reload: () => Promise<unknown>) {
  const { mutateAsync } = useMutation(orpc.ticket.transition.mutationOptions());
  const [moving, setMoving] = useState<readonly string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [failure, setFailure] = useState<MoveFailure | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);

  const run = useCallback(
    async (key: string, from: TicketStatus, to: TicketStatus) => {
      const label = STATUS_LABELS[to];
      setMoving((keys) => [...keys, key]);
      setFailure(null);
      setAnnouncement(`Déplacement de ${key} vers ${label}…`);
      try {
        await mutateAsync({ key, to });
        await reload();
        setAnnouncement(`${key} déplacé vers ${label}.`);
      } catch (error) {
        setAnnouncement("");
        setFailure({ key, from, to, error });
        if (errorCode(error) === "NOT_FOUND") void reload();
      } finally {
        setMoving((keys) => keys.filter((current) => current !== key));
        setFocus({ key });
      }
    },
    [mutateAsync, reload],
  );

  return {
    run,
    moving,
    announcement,
    failure,
    focus,
    announce: setAnnouncement,
    dismiss: () => setFailure(null),
  };
}
