"use client";

import { useQuery } from "@tanstack/react-query";
import type { DataValidation } from "./data-header-state.ts";
import { orpc } from "./orpc.ts";
import { useReviewActions } from "./use-review-actions.ts";

/**
 * « Valider le modèle » (TK-109, B445) : `review.submit` sur le livrable `data`, au SHA de tête lu avec la page. Le
 * serveur reste l'autorité (droits owner, admin, développeur ; version). L'annonce « Modèle validé » passe par la
 * région d'état de la page ; l'échec se lit dans `error`.
 */
export function useValidateModel(
  projectId: string,
  sha: string | undefined,
  announce: (text: string) => void,
) {
  const actions = useReviewActions(projectId);
  return {
    pending: actions.pending,
    error: actions.errorFor("deliverable", "data"),
    validate: async () => {
      if (!sha) return;
      const done = await actions.decide({
        targetKind: "deliverable",
        targetRef: "data",
        version: sha,
        status: "approved",
      });
      if (done) announce("Modèle validé");
    },
  };
}

/** Décision « validé » en vigueur du livrable Données : prénom (équipe), date et SHA (B451). Lue seulement une fois validé. */
export function useDataValidation(projectId: string, enabled: boolean): DataValidation | undefined {
  const query = useQuery({
    ...orpc.review.list.queryOptions({
      input: { projectId, targetKind: "deliverable", targetRef: "data", limit: 5 },
    }),
    enabled,
  });
  const decision = query.data?.items.find((item) => item.current && item.status === "approved");
  return decision
    ? { name: decision.authorName, at: decision.createdAt, sha: decision.sha }
    : undefined;
}
