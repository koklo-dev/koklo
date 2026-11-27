"use client";

import type { ReactNode } from "react";
import { OVERLAY_MAX, PHONE_MAX, useMaxWidth } from "../lib/use-max-width.ts";
import { FicheFrame } from "./data-diagram-parts.tsx";

/**
 * Cadre d'une fiche du cahier technique (choix, opération) : colonne à droite dès 1280 px (`className`), panneau
 * superposé en dessous (seulement pour un élément demandé), plein écran avec « Liste » sous 768 px.
 */
export function TechnicalFichePanel({
  id,
  asked,
  onClose,
  back,
  label,
  description,
  className,
  children,
}: {
  id: string;
  /** L'élément vient de l'adresse : sans cela, aucun panneau ne s'ouvre de lui-même. */
  asked: boolean;
  onClose: () => void;
  back: ReactNode;
  label: string;
  description: string;
  /** Colonne à droite : largeur et marges de la planche. */
  className: string;
  children: ReactNode;
}) {
  const overlay = useMaxWidth(OVERLAY_MAX);
  const phone = useMaxWidth(PHONE_MAX);
  if (!overlay) {
    return (
      <aside aria-label={label} className={className}>
        {children}
      </aside>
    );
  }
  if (!asked) return null;
  if (phone) {
    return (
      <aside aria-label={label} className="flex w-full min-w-0 flex-col gap-3 px-4 py-4">
        {back}
        {children}
      </aside>
    );
  }
  return (
    <FicheFrame id={id} onClose={onClose} label={label} description={description}>
      {children}
    </FicheFrame>
  );
}
