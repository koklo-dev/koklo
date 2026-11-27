"use client";

import { useQuery } from "@tanstack/react-query";
import type { DataValidation } from "./data-header-state.ts";
import { orpc } from "./orpc.ts";
import { useReviewActions } from "./use-review-actions.ts";

/**
 * « Valider » un livrable (TK-109 Données, B445 ; TK-113 Architecture, B577 ; TK-116 Technique) : `review.submit` sur le
 * livrable, au SHA de tête lu avec la page. Le serveur reste l'autorité (droits owner, admin, développeur ; version ;
 * choix tranchés). L'annonce passe par la région d'état de la page ; l'échec se lit dans `error`.
 */
const VALIDATED_TEXT = {
  data: "Modèle validé",
  architecture: "Architecture validée",
  technical: "Cahier technique validé",
  security: "Sécurité validée",
} as const;

export function useValidateDeliverable(
  key: keyof typeof VALIDATED_TEXT,
  projectId: string,
  sha: string | undefined,
  announce: (text: string) => void,
) {
  const actions = useReviewActions(projectId);
  return {
    pending: actions.pending,
    error: actions.errorFor("deliverable", key),
    /** Résout à `true` quand la décision est enregistrée. */
    validate: async (): Promise<boolean> => {
      if (!sha) return false;
      const done = await actions.decide({
        targetKind: "deliverable",
        targetRef: key,
        version: sha,
        status: "approved",
      });
      if (done) announce(VALIDATED_TEXT[key]);
      return done;
    },
  };
}

/** « Valider le modèle » (Données) : le livrable `data`. */
export const useValidateModel = (
  projectId: string,
  sha: string | undefined,
  announce: (text: string) => void,
) => useValidateDeliverable("data", projectId, sha, announce);

/** Décision « validé » en vigueur d'un livrable : prénom (équipe), date et SHA (B451, B591). Lue seulement une fois validé. */
export function useDeliverableValidation(
  key: keyof typeof VALIDATED_TEXT,
  projectId: string,
  enabled: boolean,
): DataValidation | undefined {
  const query = useQuery({
    ...orpc.review.list.queryOptions({
      input: { projectId, targetKind: "deliverable", targetRef: key, limit: 5 },
    }),
    enabled,
  });
  const decision = query.data?.items.find((item) => item.current && item.status === "approved");
  return decision
    ? { name: decision.authorName, at: decision.createdAt, sha: decision.sha }
    : undefined;
}

/** Décision « validé » en vigueur du livrable Données. */
export const useDataValidation = (projectId: string, enabled: boolean) =>
  useDeliverableValidation("data", projectId, enabled);
