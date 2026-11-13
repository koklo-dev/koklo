"use client";

import { type DiagramNode, type DiagramPoint, erTableHeight, useToast } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { relationsOf } from "./data-diagram.ts";
import {
  type DiagramCard,
  diagramOf,
  parseModelMermaid,
  parseModelRelations,
} from "./data-mermaid.ts";
import { orpc } from "./orpc.ts";

/** Noms et zones des tables : la première centaine de `spec.data.tables.list` ; au-delà, le nom se déduit de l'identifiant et la zone manque. */
const NAMES_LIMIT = 100;
/** Largeur d'une carte (maquette 11 l.376-388). */
export const CARD_WIDTH = 230;
/** Dépôt des positions 600 ms après le dernier glisser (B418) : une rafale de gestes, un seul lot. */
const SAVE_DELAY_MS = 600;
const COORD_MAX = 20000;

/** Nœud du lecteur : la carte et sa taille, qui sert au placement. */
export interface TableNode extends DiagramNode {
  card: DiagramCard;
}

export const nodeOf = (card: DiagramCard): TableNode => ({
  id: card.id,
  name: card.name,
  width: CARD_WIDTH,
  height: erTableHeight(card.fields.length),
  card,
});

const clamp = (value: number): number => Math.min(COORD_MAX, Math.max(0, Math.round(value)));

/**
 * Enregistrement des positions : le client écrit tout le plan (celles du dépôt et les déplacées) à chaque dépôt,
 * 600 ms après le dernier geste. Un échec garde la carte à sa place à l'écran (toast) ; le dépôt suivant renvoie tout.
 */
function useLayoutSave(
  projectId: string,
  saved: Readonly<Record<string, DiagramPoint>> | undefined,
) {
  const { toast } = useToast();
  const [moved, setMoved] = useState<Record<string, DiagramPoint>>({});
  const plan = useRef<Record<string, DiagramPoint>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positions = useMemo(() => ({ ...saved, ...moved }), [saved, moved]);
  plan.current = positions;

  const flush = useCallback(async () => {
    timer.current = null;
    try {
      await orpc.spec.data.layout.save.call({
        projectId,
        idempotencyKey: crypto.randomUUID(),
        positions: plan.current,
      });
    } catch {
      toast({ tone: "error", title: "Mise en page non enregistrée" });
    }
  }, [projectId, toast]);

  const move = useCallback(
    (id: string, point: DiagramPoint) => {
      const next = { x: clamp(point.x), y: clamp(point.y) };
      plan.current = { ...plan.current, [id]: next };
      setMoved((prev) => ({ ...prev, [id]: next }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );
  // Quitter l'onglet pendant la minute d'attente ne perd pas le dernier geste.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    },
    [flush],
  );
  return { positions, move };
}

/**
 * Données de l'onglet Diagramme : le modèle de la tête (`spec.data.mermaid`, un seul appel : tables, relations et
 * texte Mermaid de la fiche) nommé d'après la liste des tables, les tables proposées quand une relecture est ouverte,
 * et les positions enregistrées (`spec.data.layout.get`, vides si le fichier est absent).
 */
export function useDataDiagram(projectId: string, proposedNow: readonly DiagramCard[]) {
  // Les propositions se recalculent à chaque rendu : on garde la même liste tant que leur contenu ne change pas.
  const proposedKey = JSON.stringify(proposedNow);
  // biome-ignore lint/correctness/useExhaustiveDependencies: la clé est le contenu de `proposedNow`
  const proposed = useMemo(() => proposedNow, [proposedKey]);
  const mermaid = useQuery(orpc.spec.data.mermaid.queryOptions({ input: { projectId } }));
  const names = useQuery(
    orpc.spec.data.tables.list.queryOptions({ input: { projectId, limit: NAMES_LIMIT } }),
  );
  const layout = useQuery(orpc.spec.data.layout.get.queryOptions({ input: { projectId } }));
  const { positions, move } = useLayoutSave(projectId, layout.data?.positions);
  const text = mermaid.data?.text ?? "";
  const cards = useMemo(() => {
    const items = names.data?.items ?? [];
    const nameOf = new Map(items.map((item) => [item.specId, item.name]));
    const zoneOf = new Map(items.flatMap((item) => (item.zone ? [[item.specId, item.zone]] : [])));
    return diagramOf(parseModelMermaid(text), nameOf, proposed, zoneOf);
  }, [text, names.data, proposed]);
  const links = useMemo(() => parseModelRelations(text), [text]);
  return {
    cards,
    nodes: useMemo(() => cards.map(nodeOf), [cards]),
    links,
    relations: useMemo(() => relationsOf(links, cards), [links, cards]),
    mermaidText: text,
    positions,
    move,
    loading: mermaid.isPending,
    error: mermaid.isError,
    retry: () => void mermaid.refetch(),
  };
}
