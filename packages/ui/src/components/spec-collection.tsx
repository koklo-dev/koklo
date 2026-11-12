"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { Icon } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

/** Sous cette largeur la fiche n'est plus ancrée : elle passe en panneau superposé (maquette 10, DESIGN.md §5.15). */
const OVERLAY_QUERY = "(max-width: 1279px)";

/** Vrai quand la fiche est un panneau superposé ; faux sans `matchMedia` (rendu serveur, tests sans fenêtre). */
function useOverlayMode(): boolean {
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(OVERLAY_QUERY);
    const sync = () => setOverlay(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return overlay;
}

export interface SpecCollectionProps {
  /** Colonne de gauche : recherche, filtres, liste. */
  list: ReactNode;
  /** Fiche de l'élément choisi ; absente : la liste occupe toute la largeur. */
  detail?: ReactNode;
  /** Nom de la région de la fiche (« Fiche de la fonctionnalité »). */
  detailLabel: string;
  /** Ferme la fiche : « ← Liste » sous 1024 px, croix de 1024 à 1279 px, Échap en panneau superposé. */
  onCloseDetail: () => void;
  closeLabel?: string;
  /** Texte visible du retour plein écran (sous 1024 px) ; par défaut le nom de la fermeture (WCAG 2.5.3 : le nom contient le texte visible). */
  backLabel?: string;
  className?: string;
}

/**
 * Collection de la spec (maquette 10 l.179-221) : la liste à gauche (`flex 999 1 420px`), la fiche ancrée à droite
 * (380 à 440 px, bordure gauche). Sous 1280 px la fiche devient un panneau superposé ; sous 1024 px elle prend
 * l'écran et un retour « ← Liste » la ferme. La liste est inerte tant que le panneau la recouvre. Échap, dans la
 * fiche, la ferme.
 */
export function SpecCollection({
  list,
  detail,
  detailLabel,
  onCloseDetail,
  closeLabel = "Fermer la fiche",
  backLabel,
  className,
}: SpecCollectionProps) {
  const overlay = useOverlayMode();
  const covered = overlay && Boolean(detail);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCloseDetail();
    }
  };
  return (
    <div data-slot="spec-collection" className={cn("flex min-h-0 flex-1 flex-wrap", className)}>
      <div
        data-slot="spec-collection-list"
        inert={covered || undefined}
        className="flex min-w-0 flex-[999_1_420px] flex-col gap-3"
      >
        {list}
      </div>
      {detail ? (
        <aside
          aria-label={detailLabel}
          data-slot="spec-collection-detail"
          onKeyDown={onKeyDown}
          className={cn(
            "flex flex-[1_1_380px] flex-col gap-3.5 border-l border-border pl-6 xl:max-w-[440px]",
            "max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:w-[440px] max-xl:max-w-full max-xl:overflow-y-auto max-xl:bg-background max-xl:p-4 max-xl:shadow-lg",
            "max-lg:w-full max-lg:border-l-0",
          )}
        >
          <button
            type="button"
            onClick={onCloseDetail}
            className="inline-flex h-11 items-center gap-1 self-start rounded-md px-2 text-meta font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:-ml-2 lg:size-9 lg:justify-center lg:px-0 xl:hidden"
          >
            <Icon name="chevron_left" size={20} className="lg:hidden" />
            <span className="lg:sr-only">{backLabel ?? closeLabel}</span>
            <Icon name="close" size={20} className="max-lg:hidden" />
          </button>
          {detail}
        </aside>
      ) : null}
    </div>
  );
}
