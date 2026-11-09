"use client";

import type { IdeaPageSummary } from "@koklo/contract";
import {
  Button,
  DecisionNotice,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  InlineAlert,
  PageNavItem,
  PageStatus,
  ProposedPageList,
  ReorderableList,
  RequiredTag,
  StatusLegend,
  SynthesisNavItem,
} from "@koklo/ui";
import { useEffect, useRef } from "react";
import { buttonsNamed, focusWhenReady, undoButtonOf, visible } from "../lib/idea-focus.ts";
import { moveAnnouncement, numberedTitle, SYNTHESIS_PAGE } from "../lib/idea-labels.ts";
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

const synthesisHref = (projectId: string): string =>
  `${ideaPath(projectId)}?page=${SYNTHESIS_PAGE}`;

/** Première ligne de l'arborescence (maquette 06 l.74) : « générée » dès qu'une version existe. */
function SynthesisRow({ model }: { model: IdeaModel }) {
  return (
    <SynthesisNavItem
      href={synthesisHref(model.projectId)}
      current={model.synthesisOpen}
      tag={model.version.latest ? "générée" : null}
      LinkComponent={ShellLink}
    />
  );
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
          pending={page.pendingProposals > 0}
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

const treeLinks = () =>
  document.querySelectorAll<HTMLElement>("nav[aria-label='Pages du dossier'] a");

/**
 * Après « Ignorer » : « Annuler » de la trace. Après « Ajouter la page » : l'entrée de la nouvelle page dans
 * l'arborescence, sinon la carte suivante, sinon « Ajouter une page », sinon le menu des pages (375 px).
 */
function focusAfterPageDecision(
  id: string,
  decision: "accept" | "reject",
  title: string,
  nextCardId: string | undefined,
) {
  focusWhenReady((left) => {
    if (decision === "reject") return undoButtonOf(id);
    const created = visible([...treeLinks()].filter((link) => link.textContent?.includes(title)));
    if (!created && left > 20) return null; // la relecture n'a pas encore rendu la nouvelle page
    return (
      created ??
      (nextCardId ? visible(buttonsNamed("Ajouter la page")) : undefined) ??
      visible(buttonsNamed("Ajouter une page")) ??
      visible(document.querySelectorAll<HTMLElement>("nav[aria-label='Pages du dossier'] button"))
    );
  });
}

/** Après « Annuler » d'une page ignorée : « Ajouter la page » de la carte rétablie (copie affichée). */
function focusRestoredCard(title: string | null) {
  focusWhenReady(() =>
    visible(
      [...document.querySelectorAll<HTMLElement>("[data-slot='proposed-page-card']")]
        .filter((card) => !title || card.textContent?.includes(title))
        .flatMap((card) => [...card.querySelectorAll<HTMLElement>("button")])
        .filter((button) => button.textContent?.trim() === "Ajouter la page"),
    ),
  );
}

/** Pages proposées par l'agent : décision humaine, dans l'arborescence (maquette 06 l.88-98). */
function PageProposals({ model }: { model: IdeaModel }) {
  const { pageProposals, decisions, canWrite } = model;
  if (!canWrite || pageProposals.length === 0) return null;
  const find = (id: string) => pageProposals.find((proposal) => proposal.id === id);
  const items = pageProposals.map((proposal) => ({
    id: proposal.id,
    title: proposal.title ?? "Page sans titre",
    rationale: `Proposée par l'agent : ${proposal.rationale}`,
  }));
  const decide = async (id: string, decision: "accept" | "reject") => {
    const proposal = find(id);
    if (!proposal) return;
    const next = pageProposals.find((other) => other.id !== id)?.id;
    if (await decisions.decide(proposal, decision))
      focusAfterPageDecision(id, decision, proposal.title ?? "", next);
  };
  return (
    <div className="mx-0.5 mt-3.5 mb-2.5">
      <ProposedPageList
        items={items}
        busyId={decisions.busyId}
        onAccept={(id) => void decide(id, "accept")}
        onIgnore={(id) => void decide(id, "reject")}
      />
    </div>
  );
}

/** Traces des pages ajoutées ou ignorées (pas de page ouverte pour les porter) et erreur de décision. */
function PageDecisionNotices({ model }: { model: IdeaModel }) {
  const { decisions } = model;
  const notices = decisions.notices.filter((notice) => notice.pageId === null);
  return (
    <>
      {notices.map((notice) => (
        <DecisionNotice
          key={notice.proposalId}
          data-notice-id={notice.proposalId}
          onUndo={
            notice.undoable
              ? () => void decisions.undo(notice).then(() => focusRestoredCard(notice.title))
              : undefined
          }
        >
          {notice.text}
        </DecisionNotice>
      ))}
    </>
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
      className="hidden w-[264px] shrink-0 flex-col gap-0.5 border-r px-3 py-4 lg:flex lg:overflow-y-auto"
    >
      <div className="flex flex-col gap-0.5 px-2 pb-2.5">
        <span className="text-group-label text-muted-foreground uppercase">Pages</span>
        <span className="text-caption text-muted-foreground">
          {model.canWrite
            ? "Structure de cadrage par défaut · glisser pour réordonner"
            : "Structure de cadrage par défaut"}
        </span>
      </div>
      <SynthesisRow model={model} />
      <PageRows model={model} handlers={handlers} />
      {handlers.deleting ? <DeleteConfirm page={handlers.deleting} handlers={handlers} /> : null}
      <PageProposals model={model} />
      <PageDecisionNotices model={model} />
      <AddPage model={model} handlers={handlers} />
      <StatusLegend />
      <IdeaTrash model={model} />
    </nav>
  );
}

/** Sous 768 px : l'arborescence devient un menu « 05 · Périmètre » au-dessus du document, sans glisser tactile. */
export function IdeaTreeMobile({ model, handlers }: { model: IdeaModel; handlers: TreeHandlers }) {
  const { pages, current, currentIndex, projectId } = model;
  if (!current && !model.synthesisOpen) return null;
  const label = current ? numberedTitle(current.title, currentIndex) : "Synthèse";
  return (
    <nav aria-label="Pages du dossier" className="flex flex-col gap-2 border-b px-4 py-3 lg:hidden">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="h-11 min-w-0 flex-1 justify-between">
              <span className="truncate">{label}</span>
              <Icon name="keyboard_arrow_down" size={20} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[calc(100vw-2rem)]">
            <DropdownMenuItem asChild className="min-h-11">
              <ShellLink
                href={synthesisHref(projectId)}
                aria-current={model.synthesisOpen ? "page" : undefined}
                className={model.synthesisOpen ? "bg-secondary font-semibold" : undefined}
              >
                <Icon name="wand_stars" size={18} className="text-primary" />
                <span className="min-w-0 flex-1 truncate">Synthèse</span>
                {model.version.latest ? <RequiredTag label="générée" /> : null}
              </ShellLink>
            </DropdownMenuItem>
            {pages.map((page, index) => (
              <DropdownMenuItem key={page.id} asChild className="min-h-11">
                <ShellLink
                  href={pageHref(projectId, page)}
                  aria-current={page.id === current?.id ? "page" : undefined}
                  className={page.id === current?.id ? "bg-secondary font-semibold" : undefined}
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
        {model.canWrite && current ? (
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
      <PageProposals model={model} />
      <PageDecisionNotices model={model} />
      <IdeaTrash model={model} />
    </nav>
  );
}
