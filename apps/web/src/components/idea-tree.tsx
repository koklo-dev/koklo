"use client";

import type { IdeaPageSummary } from "@koklo/contract";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  InlineAlert,
  PageNavItem,
  PageStatus,
  ReorderableList,
  RequiredTag,
  StatusLegend,
} from "@koklo/ui";
import { useEffect, useRef } from "react";
import { moveAnnouncement, numberedTitle } from "../lib/idea-labels.ts";
import { ideaPath } from "../lib/shell-routes.ts";
import type { IdeaModel } from "../lib/use-idea-page.ts";
import { IdeaPageMenu } from "./idea-page-menu.tsx";
import { IdeaTrash } from "./idea-trash.tsx";
import { ShellLink } from "./shell-link.tsx";

export interface TreeHandlers {
  onRename: (page: IdeaPageSummary) => void;
  onInsertAfter: (page: IdeaPageSummary) => void;
  onMove: (page: IdeaPageSummary, direction: -1 | 1) => void;
  onAdd: () => void;
  deleting: IdeaPageSummary | null;
  onAskDelete: (page: IdeaPageSummary | null) => void;
  onConfirmDelete: () => void;
}

const pageHref = (projectId: string, page: IdeaPageSummary): string =>
  `${ideaPath(projectId)}?page=${page.slug}`;

function DeleteConfirm({ page, handlers }: { page: IdeaPageSummary; handlers: TreeHandlers }) {
  const keep = useRef<HTMLDivElement>(null);
  // La confirmation prend le focus sur « Garder » : l'option sûre est la première atteinte.
  // Après la fermeture du menu qui l'a ouverte : tant qu'il est ouvert, il retient le focus.
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      keep.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div ref={keep}>
      <InlineAlert
        variant="warning"
        icon="warning"
        actions={[
          { label: "Garder", onClick: () => handlers.onAskDelete(null) },
          { label: "Supprimer", onClick: handlers.onConfirmDelete },
        ]}
      >
        Supprimer « {page.title} » ? Elle reste 30 jours dans la corbeille.
      </InlineAlert>
    </div>
  );
}

function PageRows({ model, handlers }: { model: IdeaModel; handlers: TreeHandlers }) {
  const { pages, current, projectId, canWrite, actions } = model;
  return (
    <ReorderableList
      items={pages}
      readOnly={!canWrite}
      onReorder={(ids) => void actions.reorder(ids)}
      handleLabel={(page, index) => `Déplacer ${numberedTitle(page.title, index)}`}
      announce={(page, position, total) => moveAnnouncement(page.title, position, total)}
      highlight={(page) => page.origin === "user"}
      renderItem={(page, index) => (
        <PageNavItem
          href={pageHref(projectId, page)}
          title={numberedTitle(page.title, index)}
          status={page.status}
          required={page.required}
          current={page.id === current?.id}
          LinkComponent={ShellLink}
          actions={
            canWrite ? (
              <IdeaPageMenu
                page={page}
                title={numberedTitle(page.title, index)}
                first={index === 0}
                last={index === pages.length - 1}
                actions={{
                  onRename: () => handlers.onRename(page),
                  onInsertAfter: () => handlers.onInsertAfter(page),
                  onMove: (direction) => handlers.onMove(page, direction),
                  onDelete: () => handlers.onAskDelete(page),
                }}
              />
            ) : null
          }
        />
      )}
    />
  );
}

function AddPage({ model, handlers }: { model: IdeaModel; handlers: TreeHandlers }) {
  if (!model.canWrite) return null;
  return (
    <Button
      type="button"
      variant="dashed"
      size="sm"
      icon="add"
      className="mx-0.5 mt-1.5 h-[34px] justify-start gap-2 rounded-lg px-2.5 max-md:h-11"
      onClick={handlers.onAdd}
      disabled={model.actions.create.isPending}
    >
      Ajouter une page
    </Button>
  );
}

/** Arborescence en colonne de 264 (dès 768 px) : pages réordonnables, ajout, légende, corbeille. */
export function IdeaTreeDesktop({ model, handlers }: { model: IdeaModel; handlers: TreeHandlers }) {
  return (
    <nav
      aria-label="Pages du dossier"
      className="hidden w-[264px] shrink-0 flex-col gap-0.5 border-r px-3 py-4 lg:flex"
    >
      <div className="flex flex-col gap-0.5 px-2 pb-2.5">
        <span className="text-group-label text-muted-foreground uppercase">Pages</span>
        <span className="text-caption text-muted-foreground">
          {model.canWrite
            ? "Structure de cadrage par défaut · glisser pour réordonner"
            : "Structure de cadrage par défaut"}
        </span>
      </div>
      <PageRows model={model} handlers={handlers} />
      {handlers.deleting ? <DeleteConfirm page={handlers.deleting} handlers={handlers} /> : null}
      <AddPage model={model} handlers={handlers} />
      <StatusLegend />
      <IdeaTrash model={model} />
    </nav>
  );
}

/** Sous 768 px : l'arborescence devient un menu « 05 · Périmètre » au-dessus du document, sans glisser tactile. */
export function IdeaTreeMobile({ model, handlers }: { model: IdeaModel; handlers: TreeHandlers }) {
  const { pages, current, currentIndex, projectId } = model;
  if (!current) return null;
  return (
    <nav aria-label="Pages du dossier" className="flex flex-col gap-2 border-b px-4 py-3 lg:hidden">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="h-11 min-w-0 flex-1 justify-between">
              <span className="truncate">{numberedTitle(current.title, currentIndex)}</span>
              <Icon name="keyboard_arrow_down" size={20} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)]">
            {pages.map((page, index) => (
              <DropdownMenuItem key={page.id} asChild className="min-h-11">
                <ShellLink
                  href={pageHref(projectId, page)}
                  aria-current={page.id === current.id ? "page" : undefined}
                  className={page.id === current.id ? "bg-secondary font-semibold" : undefined}
                >
                  <PageStatus status={page.status} />
                  <span className="min-w-0 flex-1 truncate">
                    {numberedTitle(page.title, index)}
                  </span>
                  {page.required ? <RequiredTag /> : null}
                </ShellLink>
              </DropdownMenuItem>
            ))}
            {model.canWrite ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-11" onSelect={handlers.onAdd}>
                  Ajouter une page
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        {model.canWrite ? (
          <IdeaPageMenu
            page={current}
            title={numberedTitle(current.title, currentIndex)}
            first={currentIndex === 0}
            last={currentIndex === pages.length - 1}
            actions={{
              onRename: () => handlers.onRename(current),
              onInsertAfter: () => handlers.onInsertAfter(current),
              onMove: (direction) => handlers.onMove(current, direction),
              onDelete: () => handlers.onAskDelete(current),
            }}
          />
        ) : null}
      </div>
      {handlers.deleting ? <DeleteConfirm page={handlers.deleting} handlers={handlers} /> : null}
      <IdeaTrash model={model} />
    </nav>
  );
}
