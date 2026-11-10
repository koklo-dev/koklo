"use client";

import type { ProjectCard as ProjectCardData } from "@koklo/contract";
import { Button, EmptyState, InlineAlert, ListFooter, ProjectCard, Skeleton } from "@koklo/ui";
import type { Ref } from "react";
import { type CardAudience, cardPropsOf } from "../lib/project-card-model.ts";
import type { GridFooter } from "../lib/use-projects-page.ts";
import { CreationCard, hasCreation } from "./creation-card.tsx";
import { ShellLink } from "./shell-link.tsx";

const NOUN = { one: "projet", other: "projets" };
const PAGE_SIZE = 24;
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4";

/** Une création en cours ou en échec reste en tête de grille (ordre inchangé pour le reste). */
function creatingFirst(cards: ProjectCardData[]): ProjectCardData[] {
  return [...cards.filter(hasCreation), ...cards.filter((card) => !hasCreation(card))];
}

export function ProjectsLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="projects-loading"
      className="flex flex-col gap-4"
    >
      <p className="text-meta text-muted-foreground">Chargement des projets…</p>
      <div className={GRID} aria-hidden="true">
        {[0, 1, 2].map((slot) => (
          <Skeleton key={slot} className="h-56 rounded-dialog" />
        ))}
      </div>
    </div>
  );
}

export function ProjectsError({ onRetry }: { onRetry: () => void }) {
  return (
    <InlineAlert
      data-testid="projects-error"
      variant="error"
      icon="error"
      action={{ label: "Réessayer", onClick: onRetry }}
    >
      Impossible de charger les projets
    </InlineAlert>
  );
}

/** Aucun projet du tout : invitation à créer (équipe de gestion) ou simple constat (les autres rôles). */
export function ProjectsEmpty({
  onCreate,
  createButtonRef,
}: {
  onCreate?: (() => void) | undefined;
  createButtonRef?: Ref<HTMLButtonElement> | undefined;
}) {
  return (
    <EmptyState
      data-testid="projects-empty"
      icon="folder_open"
      title="Aucun projet pour l'instant"
      description={
        onCreate
          ? "Créez un projet pour commencer le dossier d'idée avec votre client."
          : "Les projets auxquels vous avez accès apparaîtront ici."
      }
      {...(onCreate
        ? {
            action: (
              <Button
                ref={createButtonRef}
                data-testid="create-project-button"
                className="h-11 md:h-9"
                onClick={onCreate}
              >
                Nouveau projet
              </Button>
            ),
          }
        : {})}
    />
  );
}

/** Filtres ou recherche sans résultat : la recherche porte sur tous les projets, pas seulement ceux affichés. */
export function ProjectsNoMatch({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      data-testid="projects-no-match"
      variant="inline"
      icon="search"
      title="Aucun projet ne correspond"
      description="Aucun projet ne correspond à cette recherche ou à ces filtres."
      action={
        <Button variant="outline" className="h-11 md:h-9" onClick={onClear}>
          Effacer les filtres
        </Button>
      }
    />
  );
}

/** Grille de cartes (maquette 08 l.84-121) : `ul` de liens, pied de liste et sentinelle de chargement. */
export function ProjectsGrid({
  cards,
  audience,
  footer,
  sentinel,
}: {
  cards: ProjectCardData[];
  audience: CardAudience;
  footer: GridFooter;
  sentinel: Ref<HTMLDivElement>;
}) {
  const now = Date.now();
  return (
    <div className="flex flex-col gap-4" aria-busy={footer.state === "loading" || undefined}>
      <ul aria-label="Projets" data-testid="projects-grid" className={`${GRID} m-0 list-none p-0`}>
        {creatingFirst(cards).map((card) => (
          <li key={card.id} className="flex">
            {hasCreation(card) ? (
              <CreationCard card={card} className="w-full" />
            ) : (
              <ProjectCard
                {...cardPropsOf(card, audience, now)}
                LinkComponent={ShellLink}
                className="w-full"
              />
            )}
          </li>
        ))}
      </ul>
      <div ref={sentinel} aria-hidden="true" />
      <ListFooter
        className="max-md:[&_button]:h-11 max-md:[&_button]:w-full"
        state={footer.state}
        pageSize={PAGE_SIZE}
        loadedCount={footer.loadedCount}
        total={footer.total}
        noun={NOUN}
        onLoadMore={footer.onLoadMore}
        onRetry={footer.onRetry}
      />
    </div>
  );
}
