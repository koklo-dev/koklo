"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { conflictReason, errorCode } from "./api-error.ts";
import { orpc } from "./orpc.ts";

export interface Decision {
  targetKind: "feature" | "flow" | "rules" | "roles" | "deliverable";
  targetRef: string;
  /** Jeton opaque lu avec le contenu relu ; renvoyé tel quel. */
  version: string;
  status: "approved" | "changes_requested" | "withdrawn";
  comment?: string;
}

/** Phrase de l'échec d'une décision ; jamais le code technique ni le texte du serveur (B353). */
export function decisionErrorText(error: unknown): string {
  if (conflictReason(error) === "review_incomplete") return "Il reste des éléments à traiter";
  switch (errorCode(error)) {
    case "STALE_VERSION":
      return "Le cahier a changé depuis votre lecture. Rechargez la page pour relire la version à jour.";
    case "FORBIDDEN":
      return "Vous ne pouvez pas valider ce cahier.";
    default:
      return "La décision n'a pas pu être enregistrée. Réessayez.";
  }
}

/**
 * Décision du client (`review.submit`) : valider, demander un changement ou annuler. Le serveur reste l'autorité
 * (droits, complétude, version). Après une décision, la progression et les listes se relisent.
 */
export function useReviewActions(projectId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...orpc.review.submit.mutationOptions(),
    // La décision n'est « enregistrée » pour l'écran qu'une fois la progression relue : la suivante en dépend.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.clientSpace.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.spec.deliverables.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.review.key() }),
      ]),
  });
  /** Cible de la dernière décision : l'échec ne s'affiche que sous elle. */
  const [last, setLast] = useState<string | undefined>();
  return {
    pending: mutation.isPending,
    /** Phrase d'échec de la dernière décision, seulement si elle portait sur cette cible. */
    errorFor: (kind: Decision["targetKind"], ref: string): string | undefined =>
      mutation.isError && last === `${kind}:${ref}` ? decisionErrorText(mutation.error) : undefined,
    /** Résout à `true` quand la décision est enregistrée. */
    decide: async ({ comment, ...rest }: Decision): Promise<boolean> => {
      setLast(`${rest.targetKind}:${rest.targetRef}`);
      try {
        await mutation.mutateAsync({ projectId, ...rest, ...(comment ? { comment } : {}) });
        return true;
      } catch {
        return false;
      }
    },
  };
}
