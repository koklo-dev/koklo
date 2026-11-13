"use client";

import { useQuery } from "@tanstack/react-query";
import { type DiagramCard, diagramOf, parseModelMermaid } from "./data-mermaid.ts";
import { orpc } from "./orpc.ts";

/** Noms des tables : la première centaine de `spec.data.tables.list` (le diagramme minimal affiche des cartes en grille). */
const NAMES_LIMIT = 100;

/**
 * Cartes du diagramme minimal : le modèle de la tête (`spec.data.mermaid`, un seul appel) nommé d'après la liste des
 * tables, puis les tables proposées par l'agent (à relire, rejetées) quand une relecture est ouverte.
 */
export function useDataDiagram(
  projectId: string,
  enabled: boolean,
  proposed: readonly DiagramCard[],
) {
  const mermaid = useQuery({
    ...orpc.spec.data.mermaid.queryOptions({ input: { projectId } }),
    enabled,
  });
  const names = useQuery({
    ...orpc.spec.data.tables.list.queryOptions({ input: { projectId, limit: NAMES_LIMIT } }),
    enabled,
  });
  const nameOf = new Map((names.data?.items ?? []).map((item) => [item.specId, item.name]));
  const cards = diagramOf(parseModelMermaid(mermaid.data?.text ?? ""), nameOf, proposed);
  return {
    cards,
    loading: mermaid.isPending && enabled,
    error: mermaid.isError,
    retry: () => void mermaid.refetch(),
  };
}
