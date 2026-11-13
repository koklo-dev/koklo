"use client";

import { EmptyState, ErTableCard, Icon, Skeleton } from "@koklo/ui";
import { useDataDiagram } from "../lib/use-data-diagram.ts";
import type { DataPageModel } from "../lib/use-data-page.ts";
import { ErrorNotice } from "./error-notice.tsx";

const HINT_REVIEW =
  "Pointillés : proposition à relire · estompée : rejetée. Les décisions se prennent dans l'onglet Relecture.";
const HINT = "Les tables du modèle enregistré, avec leurs champs et leurs clés.";

/** Légende du diagramme (maquette 11 l.188-191) : les deux cardinalités et la clé. */
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
          <Icon
            name="key"
            size={16}
            fill
            className="text-status-pending-foreground"
            aria-hidden="true"
          />
        </dt>
        <dd className="m-0">clé</dd>
      </div>
    </dl>
  );
}

/**
 * Onglet Diagramme, version minimale de TK-107 (B390) : les cartes de table en grille, sans trait, sans zoom, sans
 * fiche ni glisser (le lecteur interactif vient avec TK-108). Le modèle enregistré vient de `data/model.mmd` ; en
 * relecture, les tables proposées s'y ajoutent (pointillés, estompées une fois rejetées).
 */
export function DataDiagramTab({ page }: { page: DataPageModel }) {
  const reviewing = page.propose.reviewing;
  const diagram = useDataDiagram(page.projectId, true, reviewing ? page.proposed : []);
  if (diagram.error) {
    return (
      <ErrorNotice title="Impossible de charger le diagramme" onRetry={diagram.retry}>
        Le modèle de données n'a pas pu être lu. Réessayez dans un instant.
      </ErrorNotice>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <p className="m-0 flex-1 text-caption text-muted-foreground">
          {reviewing ? HINT_REVIEW : HINT}
        </p>
        <Legend />
      </div>
      {diagram.loading ? (
        <div role="status" aria-busy="true" className="flex flex-wrap gap-4">
          <span className="sr-only">Chargement du diagramme…</span>
          {["a", "b", "c"].map((key) => (
            <Skeleton key={key} className="h-[150px] w-[230px] max-w-full rounded-[10px]" />
          ))}
        </div>
      ) : diagram.cards.length === 0 ? (
        <EmptyState
          variant="inline"
          bordered
          icon="schema"
          title="Aucune table à afficher"
          description="Le diagramme se remplit dès qu'une table est enregistrée."
        />
      ) : (
        <ul
          aria-label="Diagramme entité-relation"
          className="m-0 grid list-none grid-cols-1 justify-items-start gap-4 p-0 md:grid-cols-[repeat(auto-fill,230px)]"
        >
          {diagram.cards.map((card) => (
            <ErTableCard
              key={`${card.state ?? "saved"}-${card.id}`}
              id={card.id}
              name={card.name}
              fields={card.fields}
              state={card.state}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
