"use client";

import { STACK_PAGE_SIZE, type StackSummary } from "@koklo/contract";
import {
  Button,
  EmptyState,
  ListFooter,
  SearchField,
  StackChoiceCard,
  StackLayer,
} from "@koklo/ui";
import type { ReactNode } from "react";
import { pendingUpdatesOf } from "../lib/proposal-technical.ts";
import {
  forTextOf,
  OPEN_CHOICE,
  STACK_LAYER_LABELS,
  STACK_LAYERS,
  STACK_NOTE,
  STACK_NOUN,
  STACK_SEARCH_LABEL,
  stackIconOf,
} from "../lib/technical-labels.ts";
import { useAutoLoad } from "../lib/use-auto-load.ts";
import { OVERLAY_MAX, PHONE_MAX, useMaxWidth } from "../lib/use-max-width.ts";
import { useStackChoice } from "../lib/use-stack-choice.ts";
import type { TechnicalPageModel } from "../lib/use-technical-page.ts";
import { BackToList } from "./architecture-decision-list.tsx";
import { SettledLaunchReport } from "./launch-report-note.tsx";
import { TechnicalFichePanel } from "./technical-fiche-panel.tsx";
import { StackFiche, type StackFicheChoice } from "./technical-stack-fiche.tsx";

export interface StackCardsProps {
  items: readonly StackFicheChoice[];
  /** Comptes par couche de toute la liste ; à défaut, ceux des cartes chargées. */
  layers: Record<string, number>;
  selected: string | undefined;
  onSelect: (id: string) => void;
  staleIds?: readonly string[];
  proposedIds?: readonly string[];
}

/** Cartes rangées par couche, deux par ligne (maquette 14 l.179-187). */
export function StackCards({
  items,
  layers,
  selected,
  onSelect,
  staleIds = [],
  proposedIds = [],
}: StackCardsProps) {
  return (
    <>
      {STACK_LAYERS.map((layer) => {
        const cards = items.filter((item) => item.layer === layer);
        if (cards.length === 0) return null;
        return (
          <StackLayer
            key={layer}
            label={STACK_LAYER_LABELS[layer]}
            count={layers[layer] ?? cards.length}
          >
            {cards.map((item) => (
              <div key={item.specId} data-spec-id={item.specId} className="flex min-w-0">
                <StackChoiceCard
                  id={item.specId}
                  roleName={item.role}
                  choice={item.choice ?? OPEN_CHOICE}
                  forText={forTextOf(item.components)}
                  status={item.status}
                  icon={stackIconOf(item.icon)}
                  selected={item.specId === selected}
                  stale={staleIds.includes(item.specId)}
                  proposed={proposedIds.includes(item.specId)}
                  onSelect={() => onSelect(item.specId)}
                />
              </div>
            ))}
          </StackLayer>
        );
      })}
    </>
  );
}

/** Sans choix, rien n'a été tranché (B852). */
function countDetailOf(total: number, open: number): string {
  if (total === 0) return "· aucun pour l'instant";
  return open > 0 ? `· ${open} à trancher` : "· tous tranchés";
}

/** Barre de compte : région d'état de l'onglet (maquette 14 l.178). */
export function StackCountBar({
  total,
  open,
  announcement,
}: {
  total: number;
  open: number;
  announcement?: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-meta text-muted-foreground"
    >
      <span className="font-semibold text-foreground">{`${total} choix`}</span>
      <span>{countDetailOf(total, open)}</span>
      <span className="flex-1" />
      <span>{STACK_NOTE}</span>
      {announcement ? <span className="sr-only">{announcement}</span> : null}
    </div>
  );
}

const PANEL_CLASS =
  "flex min-w-0 flex-[1_1_480px] flex-col gap-3 border-l px-[22px] pt-4 pb-6 xl:max-w-[580px]";

/** Cadre de la fiche d'un choix : colonne de 480 à 580 px, panneau en dessous de 1280 px. */
export function StackPanel({
  id,
  asked,
  onClose,
  children,
}: {
  id: string;
  asked: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <TechnicalFichePanel
      id={id}
      asked={asked}
      onClose={onClose}
      back={<BackToList onClick={onClose} />}
      label="Fiche du choix technique"
      description="Rôle, options comparées et liens du choix technique ouvert."
      className={PANEL_CLASS}
    >
      {children}
    </TechnicalFichePanel>
  );
}

/** Choix ouvert à l'arrivée : celui de l'adresse, sinon le premier à trancher, sinon le premier. */
export const selectedChoiceOf = <T extends StackFicheChoice>(
  items: readonly T[],
  sel: string | undefined,
): T | undefined =>
  items.find((item) => item.specId === sel) ??
  items.find((item) => item.status === "open") ??
  items[0];

/** Carte pressée : le choix dont la fiche se lit ; sous 1280 px, seulement un choix demandé. */
export function usePressedChoice(sel: string | undefined, shown: string | undefined) {
  const overlay = useMaxWidth(OVERLAY_MAX);
  return overlay ? sel : shown;
}

/** Recherche serveur : seulement au-delà d'une page ou quand une recherche est active (B728). */
function Search({ page }: { page: TechnicalPageModel }) {
  const { search, url, totals, stack } = page;
  if (!url.q && (totals.total ?? 0) <= STACK_PAGE_SIZE) return null;
  return (
    <SearchField
      ref={search.inputRef}
      label={STACK_SEARCH_LABEL}
      placeholder={STACK_SEARCH_LABEL}
      name="q"
      autoComplete="off"
      maxLength={200}
      className="max-w-[420px] [&_input]:h-[34px] max-md:[&_input]:h-11"
      value={search.text}
      aria-busy={stack.stale || undefined}
      onChange={(event) => search.onChange(event.target.value)}
    />
  );
}

function Empty({ page }: { page: TechnicalPageModel }) {
  const { url, form } = page;
  if (url.q) {
    return (
      <EmptyState
        variant="inline"
        bordered
        icon="search_off"
        title={`Aucun choix ne correspond à « ${url.q} »`}
        description="La recherche porte sur tous les choix du projet."
        action={
          <Button variant="outline" size="sm" onClick={() => url.setQuery(null)}>
            Effacer la recherche
          </Button>
        }
      />
    );
  }
  return (
    <>
      <SettledLaunchReport propose={page.propose} />
      <EmptyState
        variant="inline"
        bordered
        icon="layers"
        title="Aucun choix technique pour l'instant"
        description="Un choix par rôle de l'architecture, avec ses options comparées."
        {...(form.canWrite
          ? {
              action: (
                <Button variant="outline" size="sm" onClick={() => url.openCreateOn("stack")}>
                  Nouveau choix
                </Button>
              ),
            }
          : {})}
      />
    </>
  );
}

function Footer({ page }: { page: TechnicalPageModel }) {
  const { footer, stack } = page;
  const sentinel = useAutoLoad(footer.onLoadMore, footer.state === "more");
  if (stack.total <= STACK_PAGE_SIZE) return null;
  return (
    <div ref={sentinel}>
      <ListFooter
        state={footer.state}
        pageSize={STACK_PAGE_SIZE}
        loadedCount={stack.items.length}
        total={stack.total}
        noun={STACK_NOUN}
        longList={footer.longList}
        onLoadMore={footer.onLoadMore}
        onRetry={footer.onRetry}
        onBackToTop={() => window.scrollTo({ top: 0 })}
      />
    </div>
  );
}

function List({ page, selected }: { page: TechnicalPageModel; selected: string | undefined }) {
  const { stack, url, totals, upstream, review, announcement, form } = page;
  const proposed = page.propose.reviewing ? pendingUpdatesOf(review.proposals, "stack") : [];
  return (
    <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3.5 px-4 pt-4 pb-6 md:pl-7">
      {form.open ? null : (
        <StackCountBar
          total={totals.total ?? stack.total}
          open={totals.open}
          announcement={announcement}
        />
      )}
      <Search page={page} />
      {stack.items.length === 0 ? (
        <Empty page={page} />
      ) : (
        <StackCards
          items={stack.items}
          layers={stack.layers}
          selected={selected}
          onSelect={url.select}
          staleIds={upstream.items}
          proposedIds={proposed}
        />
      )}
      <Footer page={page} />
    </div>
  );
}

function Detail({ page, choice }: { page: TechnicalPageModel; choice: StackSummary }) {
  const { form, write, head, projectId } = page;
  const choose = useStackChoice(projectId, write, head);
  return (
    <StackFiche
      key={choice.specId}
      projectId={projectId}
      choice={choice}
      onEdit={form.canWrite ? () => form.openEdit(choice.specId) : undefined}
      onChoose={form.canWrite ? (option) => choose(choice.specId, option) : undefined}
      choosing={write.busy}
    />
  );
}

/**
 * Onglet Stack (maquette 14 l.174-220) : barre de compte, couches, cartes ; fiche à droite dès 1280 px, en panneau en
 * dessous ; sous 768 px, la liste puis la fiche avec « Liste » pour revenir.
 */
export function TechnicalStackTab({ page }: { page: TechnicalPageModel }) {
  const { url, stack } = page;
  const phone = useMaxWidth(PHONE_MAX);
  const choice = selectedChoiceOf(stack.items, url.sel);
  const pressed = usePressedChoice(url.sel, choice?.specId);
  const onPhone = phone && url.sel !== undefined && choice !== undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-wrap lg:min-h-[calc(100dvh-162px)] xl:flex-nowrap">
      {onPhone ? null : <List page={page} selected={pressed} />}
      {choice ? (
        <StackPanel
          id={choice.specId}
          asked={url.sel !== undefined}
          onClose={() => url.select(null)}
        >
          <Detail page={page} choice={choice} />
        </StackPanel>
      ) : null}
    </div>
  );
}
