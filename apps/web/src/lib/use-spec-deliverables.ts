"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "./orpc.ts";

/**
 * Les sept livrables de la spec (`spec.deliverables`, TK-100) : disponibilité, statut et compteur « SPEC N/7 ». Le serveur
 * décide (règle B1, forçage) ; le web n'en calcule rien. Désactivé sans projet.
 */
export function useSpecDeliverables(projectId: string | null) {
  return useQuery({
    ...orpc.spec.deliverables.queryOptions({ input: { projectId: projectId ?? "" } }),
    enabled: projectId !== null,
  });
}
