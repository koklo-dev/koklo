"use client";

import { Button, Icon, ProjectHeader } from "@koklo/ui";
import { type RefObject, useRef } from "react";
import { countLabel } from "../lib/project-card-model.ts";
import type { ProjectsViewKind } from "../lib/projects-view.ts";
import { PROJECTS_PATH } from "../lib/shell-routes.ts";
import type { useProjectCards } from "../lib/use-project-cards.ts";
import { type GridFooter, useProjectsPage } from "../lib/use-projects-page.ts";
import type { useProjectsUrl } from "../lib/use-projects-url.ts";
import { PageBody } from "./page-body.tsx";
import { ProjectCreateDialog } from "./project-create-dialog.tsx";
import {
  ProjectsEmpty,
  ProjectsError,
  ProjectsGrid,
  ProjectsLoading,
  ProjectsNoMatch,
} from "./projects-grid.tsx";
import { ProjectsToolbar } from "./projects-toolbar.tsx";
import { ShellLink } from "./shell-link.tsx";

function NewProjectButton({
  buttonRef,
  onClick,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
}) {
  return (
    <Button
      ref={buttonRef}
      data-testid="create-project-button"
      className="h-11 md:h-9"
      onClick={onClick}
    >
      <Icon name="add" size={20} />
      Nouveau projet
    </Button>
  );
}

interface BodyProps {
  kind: ProjectsViewKind;
  cards: ReturnType<typeof useProjectCards>["data"];
  query: ReturnType<typeof useProjectCards>;
  url: ReturnType<typeof useProjectsUrl>;
  footer: GridFooter;
  sentinel: RefObject<HTMLDivElement | null>;
  onCreate: (() => void) | undefined;
  createButton: RefObject<HTMLButtonElement | null>;
}

/** Sous l'en-tête : barre d'outils puis l'état de la liste (chargement, erreur, vide, aucun résultat, grille). */
function ProjectsBody({
  kind,
  cards,
  query,
  url,
  footer,
  sentinel,
  onCreate,
  createButton,
}: BodyProps) {
  const pages = cards?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const toolbar = kind === "grid" || kind === "no-match";
  return (
    <>
      {toolbar ? (
        <ProjectsToolbar
          url={url}
          facets={pages[0]?.facets}
          onQuery={(q) => url.patch({ q })}
          onPhase={(phase) => url.patch({ phase })}
          onSort={(sort) => url.patch({ sort })}
        />
      ) : null}
      {kind === "loading" ? <ProjectsLoading /> : null}
      {kind === "error" ? <ProjectsError onRetry={() => void query.refetch()} /> : null}
      {kind === "empty" ? (
        <ProjectsEmpty onCreate={onCreate} createButtonRef={createButton} />
      ) : null}
      {kind === "no-match" ? (
        <ProjectsNoMatch onClear={() => url.patch({ q: null, phase: null })} />
      ) : null}
      {kind === "grid" ? (
        <ProjectsGrid
          cards={items}
          audience={pages[0]?.audience ?? "team"}
          footer={footer}
          sentinel={sentinel}
        />
      ) : null}
    </>
  );
}

function NewProjectDialog({
  creation,
  canSetEu,
  createButton,
}: {
  creation: ReturnType<typeof useProjectsPage>["creation"];
  canSetEu: boolean;
  createButton: RefObject<HTMLButtonElement | null>;
}) {
  const { dialog } = creation;
  if (dialog.key === 0) return null;
  return (
    <ProjectCreateDialog
      key={dialog.key}
      open={dialog.open}
      canSetEu={canSetEu}
      onCreated={creation.created}
      onClose={creation.close}
      onReturnFocus={() => createButton.current?.focus()}
    />
  );
}

export function ProjectsPage() {
  const page = useProjectsPage();
  const {
    url,
    query,
    head,
    kind,
    footer,
    sentinel,
    manage,
    creation,
    announcement,
    organizationName,
  } = page;
  const createButton = useRef<HTMLButtonElement>(null);

  return (
    <>
      <ProjectHeader
        project={{ name: organizationName, href: PROJECTS_PATH }}
        page="Projets"
        title="Projets"
        {...(head && kind !== "loading"
          ? { summary: countLabel(head.facets.all, head.attention) }
          : {})}
        {...(manage && kind !== "empty" && kind !== "loading"
          ? {
              primaryAction: (
                <NewProjectButton buttonRef={createButton} onClick={() => creation.open()} />
              ),
            }
          : {})}
        LinkComponent={ShellLink}
      />
      <PageBody>
        <div className="flex flex-col gap-4">
          <div role="status" className="text-meta text-muted-foreground empty:hidden">
            {announcement}
          </div>
          <ProjectsBody
            kind={kind}
            cards={query.data}
            query={query}
            url={url}
            footer={footer}
            sentinel={sentinel}
            onCreate={manage ? () => creation.open() : undefined}
            createButton={createButton}
          />
        </div>
      </PageBody>
      {manage ? (
        <NewProjectDialog creation={creation} canSetEu={manage} createButton={createButton} />
      ) : null}
    </>
  );
}
