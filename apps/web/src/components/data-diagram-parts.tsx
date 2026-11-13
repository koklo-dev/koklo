"use client";

import { ErTableCard, Icon, Sheet, SheetContent, SheetDescription, SheetTitle } from "@koklo/ui";
import { type ReactNode, useState } from "react";
import { readStoredZoom, writeStoredZoom } from "../lib/diagram-zoom-storage.ts";
import type { TableNode } from "../lib/use-data-diagram.ts";
import { NARROW_MAX, OVERLAY_MAX, useMaxWidth } from "../lib/use-max-width.ts";

export const HINT_COMPACT =
  "Zoom sous 60 % : seuls les noms des tables s'affichent. Zoomez pour voir les champs.";
export const COMPACT_BELOW = 0.6;
/** Plein cadre : la hauteur de la fenêtre moins l'en-tête de l'écran, jamais sous 420 px. */
export const VIEWER_HEIGHT = "h-[max(420px,calc(100dvh-300px))]";

/** Zoom du lecteur : sous 1024 px il s'ouvre en « Ajuster » sans lire le zoom mémorisé (B425) ; sous 60 % la carte se compacte. */
export function useDiagramZoom() {
  const narrow = useMaxWidth(NARROW_MAX);
  const [initialZoom] = useState<number | "fit">(() => (narrow ? "fit" : (readStoredZoom() ?? 1)));
  const [compact, setCompact] = useState(
    typeof initialZoom === "number" && initialZoom < COMPACT_BELOW,
  );
  return {
    initialZoom,
    compact,
    onZoomChange: (zoom: number) => {
      setCompact(zoom < COMPACT_BELOW);
      writeStoredZoom(zoom);
    },
  };
}

/** Légende du diagramme (maquette 11 l.171-176) : les deux cardinalités et la clé. */
export function Legend() {
  return (
    <dl className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
      <div className="inline-flex items-center gap-1.5">
        <dt className="font-mono text-foreground">1 → n</dt>
        <dd className="m-0">un vers plusieurs</dd>
      </div>
      <div className="inline-flex items-center gap-1.5">
        <dt className="font-mono text-foreground">n ↔ n</dt>
        <dd className="m-0">plusieurs vers plusieurs</dd>
      </div>
      <div className="inline-flex items-center gap-1.5">
        <dt>
          <Icon name="key" size={16} fill className="text-status-pending-icon" aria-hidden="true" />
        </dt>
        <dd className="m-0">clé</dd>
      </div>
    </dl>
  );
}

export const renderTable = (
  node: TableNode,
  context: { selected: boolean; compact: boolean; onSelect: () => void },
) => (
  <ErTableCard
    id={node.card.id}
    name={node.card.name}
    fields={node.card.fields}
    state={node.card.state}
    {...context}
  />
);

/** Cadre de la fiche d'une table choisie : panneau superposé à droite sous 1280 px (B426), `aside` à partir de 1280 px. */
export function FicheFrame({
  id,
  onClose,
  children,
}: {
  id: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const overlay = useMaxWidth(OVERLAY_MAX);
  if (!overlay) {
    return (
      <aside
        aria-label="Fiche de la table"
        className="flex min-w-0 flex-[1_1_340px] flex-col gap-3 border-l pl-[22px] xl:max-w-[400px]"
      >
        {children}
      </aside>
    );
  }
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="overflow-y-auto p-5 pt-12"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLElement>(`[data-spec-id="${id}"] button`)?.focus();
        }}
      >
        <SheetTitle className="sr-only">Fiche de la table</SheetTitle>
        <SheetDescription className="sr-only">
          Champs, relations et fichiers de la table choisie dans le diagramme.
        </SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  );
}
