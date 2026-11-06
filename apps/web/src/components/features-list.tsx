"use client";

import type { FeatureSummary } from "@koklo/contract";
import { CountBar, ListFooter, VirtualList } from "@koklo/ui";
import { type MouseEvent, type RefObject, useEffect, useRef, useState } from "react";
import { criteriaLabel } from "../lib/feature-labels.ts";
import { PAGE_SIZE } from "../lib/use-features.ts";
import type { useListFooter } from "../lib/use-features-list.ts";
import { FeatureLifecycle, FeaturePriority } from "./feature-status.tsx";

type Footer = ReturnType<typeof useListFooter>;

const NOUN = { one: "fonctionnalité", other: "fonctionnalités" };

interface RowProps {
  feature: FeatureSummary;
  href: string;
  onOpen: (specId: string) => void;
}

/** Clic simple : la fiche s'ouvre sans quitter la page ; clic modifié (nouvel onglet) : lien normal. */
function plainClick(event: MouseEvent): boolean {
  return event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

/**
 * Une ligne de 52 px : identifiant, titre en lien, avancement, priorité, critères. Sous 768 px, avancement et priorité
 * passent sous le titre. Le lien sort de la tabulation (une seule entrée dans la liste, flèches entre les lignes) ;
 * Entrée ou Espace sur la ligne ouvre la fiche comme lui.
 */
function FeatureRow({ feature, href, onOpen }: RowProps) {
  return (
    <>
      <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
        {feature.specId}
      </span>
      <div className="min-w-0 flex-1">
        <a
          href={href}
          tabIndex={-1}
          title={feature.title}
          data-feature-link={feature.specId}
          className="block truncate text-sm font-medium underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:outline-none"
          onClick={(event) => {
            event.stopPropagation();
            if (!plainClick(event)) return;
            event.preventDefault();
            onOpen(feature.specId);
          }}
        >
          {feature.title}
        </a>
        <p className="flex items-center gap-x-2 text-meta text-muted-foreground md:hidden">
          <FeatureLifecycle feature={feature} />
          <FeaturePriority priority={feature.priority} />
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-4 md:flex">
        <FeatureLifecycle feature={feature} />
        <FeaturePriority priority={feature.priority} />
        <span className="w-20 text-right text-meta text-muted-foreground">
          {criteriaLabel(feature.criteriaCount)}
        </span>
      </div>
    </>
  );
}

/**
 * Vrai tant que le focus est dans le pied de liste. Au clavier, « Charger la suite » ne doit pas se remplacer sous
 * les doigts : le chargement à 80 % attend que le focus en soit sorti.
 */
function useFooterFocus(frame: RefObject<HTMLElement | null>): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const root = frame.current;
    if (!root) return;
    const track = (event: Event) =>
      setFocused(
        event.type === "focusin" &&
          Boolean((event.target as HTMLElement).closest("[data-slot='list-footer']")),
      );
    root.addEventListener("focusin", track);
    root.addEventListener("focusout", track);
    return () => {
      root.removeEventListener("focusin", track);
      root.removeEventListener("focusout", track);
    };
  }, [frame]);
  return focused;
}

interface ListProps {
  items: FeatureSummary[];
  total: number;
  offset: number;
  stale: boolean;
  selected: string | undefined;
  /** Ligne amenée au centre à l'ouverture (lien direct), une seule fois. */
  centerOn: string | undefined;
  hrefFor: (specId: string) => string;
  onOpen: (specId: string) => void;
  footer: Footer;
  /** Annonce de l'écran portée par la barre de compte (recherche, écriture) ; vide : arrivée de page. */
  announcement: string;
  /** Faux sous un formulaire ouvert : sa région d'état est la seule du document. */
  showCount: boolean;
}

/**
 * Liste des fonctionnalités (schéma 1.1) : barre de compte, lignes virtualisées dont le rang vient du serveur
 * (`aria-setsize` = total, `aria-posinset` = `offset` + rang), pied de liste à quatre états.
 */
export function FeaturesList({
  items,
  total,
  offset,
  stale,
  selected,
  centerOn,
  hrefFor,
  onOpen,
  footer,
  announcement,
  showCount,
}: ListProps) {
  const frame = useRef<HTMLDivElement>(null);
  const footerFocused = useFooterFocus(frame);
  const backToTop = () =>
    frame.current?.querySelector("[data-slot='virtual-list']")?.scrollTo({ top: 0 });
  return (
    <div ref={frame} className="flex flex-col gap-2">
      {showCount ? (
        <CountBar
          total={total}
          loaded={items.length}
          noun={NOUN}
          sort="identifiant"
          busy={stale}
          {...(announcement ? { announcement } : {})}
        />
      ) : null}
      <VirtualList
        label="Fonctionnalités"
        items={items}
        total={total}
        startIndex={offset}
        getItemKey={(feature) => feature.specId}
        renderItem={(feature) => (
          <FeatureRow feature={feature} href={hrefFor(feature.specId)} onOpen={onOpen} />
        )}
        onActivate={(feature) => onOpen(feature.specId)}
        {...(selected ? { selectedKey: selected } : {})}
        {...(centerOn ? { centerOnKey: centerOn } : {})}
        className="h-auto max-h-[70vh] rounded-lg border border-border"
        busy={stale}
        hasMore={footer.hasNext}
        isLoadingMore={footer.loading || footerFocused}
        onLoadMore={footer.onLoadMore}
        hasPrevious={footer.hasPrevious}
        onLoadPrevious={footer.onLoadPrevious}
        footer={
          <ListFooter
            className="max-md:[&_button]:h-11 max-md:[&_button]:w-full"
            state={footer.state}
            pageSize={PAGE_SIZE}
            loadedCount={items.length}
            total={total}
            noun={NOUN}
            longList={footer.longList}
            onLoadMore={footer.onLoadMore}
            onRetry={footer.onRetry}
            onBackToTop={backToTop}
          />
        }
      />
    </div>
  );
}
