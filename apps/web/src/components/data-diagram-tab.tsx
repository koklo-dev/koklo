"use client";

import {
  DiagramViewer,
  EmptyState,
  ErTableCard,
  Icon,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Skeleton,
} from "@koklo/ui";
import { useState } from "react";
import { readStoredZoom, writeStoredZoom } from "../lib/diagram-zoom-storage.ts";
import { canWriteData } from "../lib/roles.ts";
import { type TableNode, useDataDiagram } from "../lib/use-data-diagram.ts";
import type { DataPageModel } from "../lib/use-data-page.ts";
import { NARROW_MAX, OVERLAY_MAX, useMaxWidth } from "../lib/use-max-width.ts";
import { DiagramFiche } from "./data-diagram-fiche.tsx";
import { ErrorNotice } from "./error-notice.tsx";

const HINT = "Cliquez une table pour voir sa fiche.";
const HINT_REVIEW =
  "Pointillés : proposition à relire · estompée : rejetée. Les décisions se prennent dans l'onglet Relecture.";
const HINT_COMPACT =
  "Zoom sous 60 % : seuls les noms des tables s'affichent. Zoomez pour voir les champs.";
const COMPACT_BELOW = 0.6;
/** Plein cadre : la hauteur de la fenêtre moins l'en-tête de l'écran, jamais sous 420 px. */
const VIEWER_HEIGHT = "h-[max(420px,calc(100dvh-300px))]";

/** Légende du diagramme (maquette 11 l.171-176) : les deux cardinalités et la clé. */
function Legend() {
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

const renderTable = (
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

type Diagram = ReturnType<typeof useDataDiagram>;

/** Fiche de la table choisie : panneau superposé à droite sous 1280 px (B426), `aside` à partir de 1280 px. */
function FichePanel({
  page,
  diagram,
  selectedId,
  onClose,
}: {
  page: DataPageModel;
  diagram: Diagram;
  selectedId: string | null;
  onClose: () => void;
}) {
  const overlay = useMaxWidth(OVERLAY_MAX);
  const card = diagram.cards.find((entry) => entry.id === selectedId);
  if (!card) return null;
  const names = new Map(diagram.cards.map((entry) => [entry.id, entry.name]));
  const fiche = (
    <DiagramFiche
      projectId={page.projectId}
      card={card}
      links={diagram.relations.filter((r) => r.from === card.id || r.to === card.id)}
      nameOf={(id) => names.get(id) ?? id}
      mermaid={diagram.mermaidText}
      onEdit={page.form.canWrite ? () => page.form.openEdit(card.id) : undefined}
    />
  );
  if (!overlay) {
    return (
      <aside
        aria-label="Fiche de la table"
        className="flex min-w-0 flex-[1_1_340px] flex-col gap-3 border-l pl-[22px] xl:max-w-[400px]"
      >
        {fiche}
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
          document.querySelector<HTMLElement>(`[data-spec-id="${card.id}"] button`)?.focus();
        }}
      >
        <SheetTitle className="sr-only">Fiche de la table</SheetTitle>
        <SheetDescription className="sr-only">
          Champs, relations et fichiers de la table choisie dans le diagramme.
        </SheetDescription>
        {fiche}
      </SheetContent>
    </Sheet>
  );
}

/** Lecteur, aide, légende et fiche : monté une fois le modèle lu (le zoom d'ouverture se décide ici, côté navigateur). */
function DiagramReader({ page, diagram }: { page: DataPageModel; diagram: Diagram }) {
  const narrow = useMaxWidth(NARROW_MAX);
  // Sous 1024 px le diagramme s'ouvre en « Ajuster », sans lire le zoom mémorisé (B425).
  const [initialZoom] = useState<number | "fit">(() => (narrow ? "fit" : (readStoredZoom() ?? 1)));
  const [compact, setCompact] = useState(
    typeof initialZoom === "number" && initialZoom < COMPACT_BELOW,
  );
  // La sélection vit dans l'adresse (`?sel=`, sans entrée d'historique) : elle survit à un remontage du lecteur.
  const selectedId = diagram.cards.some((card) => card.id === page.url.sel)
    ? (page.url.sel ?? null)
    : null;
  const reviewing = page.propose.reviewing;
  const canMove = canWriteData(page.role);
  return (
    <div className="flex flex-wrap gap-4 xl:flex-nowrap">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="m-0 flex-1 text-caption text-muted-foreground">
            {compact ? HINT_COMPACT : reviewing ? HINT_REVIEW : HINT}
          </p>
          <Legend />
        </div>
        <DiagramViewer<TableNode>
          label="Diagramme entité-relation"
          nodes={diagram.nodes}
          relations={diagram.relations}
          renderNode={renderTable}
          selectedId={selectedId}
          onSelect={page.url.select}
          positions={diagram.positions}
          onMove={canMove ? diagram.move : undefined}
          initialZoom={initialZoom}
          onZoomChange={(zoom) => {
            setCompact(zoom < COMPACT_BELOW);
            writeStoredZoom(zoom);
          }}
          className={VIEWER_HEIGHT}
        />
      </div>
      <FichePanel
        page={page}
        diagram={diagram}
        selectedId={selectedId}
        onClose={page.url.dropSelection}
      />
    </div>
  );
}

/**
 * Onglet Diagramme (maquette 11 l.168-206) : lecteur pleine hauteur du modèle enregistré, avec en relecture les
 * tables proposées (pointillés, rejetées estompées), et fiche ancrée de la table choisie. Équipe : glisser enregistré
 * dans `data/_layout.yaml` ; designer : lecture seule.
 */
export function DataDiagramTab({ page }: { page: DataPageModel }) {
  const diagram = useDataDiagram(page.projectId, page.propose.reviewing ? page.proposed : []);
  if (diagram.error) {
    return (
      <ErrorNotice title="Impossible de charger le diagramme" onRetry={diagram.retry}>
        Le modèle de données n'a pas pu être lu. Réessayez dans un instant.
      </ErrorNotice>
    );
  }
  if (diagram.loading) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Chargement du diagramme…</span>
        <Skeleton className={`${VIEWER_HEIGHT} w-full rounded-xl`} />
      </div>
    );
  }
  if (diagram.cards.length === 0) {
    return (
      <EmptyState
        variant="inline"
        bordered
        icon="schema"
        title="Aucune table à afficher"
        description="Le diagramme se remplit dès qu'une table est enregistrée."
      />
    );
  }
  return <DiagramReader page={page} diagram={diagram} />;
}
