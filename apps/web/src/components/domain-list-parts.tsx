"use client";

import {
  Button,
  CountBar,
  EmptyState,
  type IconName,
  ListFooter,
  SearchField,
  Skeleton,
} from "@koklo/ui";
import { type ReactNode, useRef } from "react";
import type { DomainPageModel } from "../lib/use-domain-page.ts";
import { FUNCTIONAL_PAGE_SIZE } from "../lib/use-functional-list.ts";

/** Barre de compte puis recherche sur toute la liste (maquette 10 l.228-229 et l.277) ; `/` y met le focus. */
export function DomainToolbar({
  page,
  total,
  loaded,
  searchLabel,
  children,
}: {
  page: DomainPageModel;
  total: number;
  loaded: number;
  searchLabel: string;
  /** Légende des types, avant la recherche. */
  children?: ReactNode;
}) {
  const { search, region, noun, url } = page;
  return (
    <div className="flex flex-col gap-3">
      {children}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {region.showCount ? (
          <CountBar
            total={total}
            loaded={loaded}
            noun={noun}
            showAllLoaded
            {...(url.q ? { query: url.q } : {})}
            busy={page.data.functional.stale}
            {...(region.countText ? { announcement: region.countText } : {})}
          />
        ) : (
          <span />
        )}
        <SearchField
          ref={search.inputRef}
          label={searchLabel}
          placeholder={searchLabel}
          name="q"
          autoComplete="off"
          maxLength={200}
          className="min-w-0 flex-[0_1_260px] max-md:[&_input]:h-11 max-md:flex-1 max-md:basis-full"
          value={search.text}
          onChange={(event) => search.onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

/** Pied de la liste de cartes : « Charger la suite », chargement, erreur de suite, fin ; précédentes d'un lien direct. */
export function DomainFooter({ page }: { page: DomainPageModel }) {
  const { footer, noun, tab } = page;
  const { functional } = page.data;
  const top = useRef<HTMLDivElement>(null);
  const size = FUNCTIONAL_PAGE_SIZE[tab === "flows" ? "flows" : "rules"];
  return (
    <div ref={top} className="flex flex-col gap-2">
      <ListFooter
        className="max-md:[&_button]:h-11 max-md:[&_button]:w-full"
        framed
        state={footer.state}
        pageSize={size}
        loadedCount={functional.items.length}
        total={functional.total}
        noun={noun}
        longList={footer.longList}
        onLoadMore={footer.onLoadMore}
        onRetry={footer.onRetry}
        onBackToTop={() => window.scrollTo({ top: 0 })}
      />
    </div>
  );
}

/** « Charger les précédentes » : une liste ouverte sur un lien direct (`?sel=R-250`) ne commence pas au premier élément. */
export function LoadPrevious({ page }: { page: DomainPageModel }) {
  const { footer } = page;
  if (!footer.hasPrevious) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 self-start md:h-9"
      onClick={footer.onLoadPrevious}
    >
      Charger les précédentes
    </Button>
  );
}

/** Quatre cartes grises dans la grille : la mise en page ne bouge pas à l'arrivée des données. */
export function CardsSkeleton({ label, wide = false }: { label: string; wide?: boolean }) {
  return (
    <div
      data-testid="domain-skeleton"
      aria-hidden="true"
      aria-busy="true"
      className={
        wide
          ? "flex flex-col gap-3"
          : "grid gap-3 lg:grid-cols-[repeat(auto-fill,minmax(420px,1fr))]"
      }
    >
      <span className="sr-only">{label}</span>
      {["a", "b", "c", "d"].map((key) => (
        <Skeleton key={key} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}

/** Onglet vide d'une spec qui ne l'est pas : une phrase, puis « Nouvelle … » ou « Proposer avec l'agent » selon les droits. */
export function DomainEmpty({
  icon,
  title,
  description,
  action,
  secondaryAction,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: React.ReactElement | undefined;
  secondaryAction?: React.ReactElement | undefined;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      {...(action ? { action } : {})}
      {...(secondaryAction ? { secondaryAction } : {})}
      className="mx-auto max-w-xl"
    />
  );
}

/** Recherche ou filtre sans résultat : la phrase dit sur quoi porte la recherche, « Effacer la recherche » en sort. */
export function DomainNoResults({
  title,
  description,
  clearLabel,
  onClear,
}: {
  title: string;
  description: string;
  clearLabel: string;
  onClear: () => void;
}) {
  return (
    <EmptyState
      variant="inline"
      bordered
      icon="search_off"
      title={title}
      description={description}
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          {clearLabel}
        </Button>
      }
    />
  );
}
