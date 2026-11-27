"use client";

import type { ReactNode } from "react";
import { OVERLAY_MAX, PHONE_MAX, useMaxWidth } from "../lib/use-max-width.ts";
import { FicheFrame } from "./data-diagram-parts.tsx";

const LABEL = "Fiche du choix technique";
const ASIDE =
  "flex min-w-0 flex-[1_1_480px] flex-col gap-3 border-l px-[22px] pt-4 pb-6 xl:max-w-[580px]";

/**
 * Cadre de la fiche d'un choix : colonne de 480 à 580 dès 1280 px, panneau superposé en dessous (seulement pour un
 * choix demandé), plein écran avec « Liste » sous 768 px.
 */
export function StackPanel({
  id,
  asked,
  onClose,
  back,
  children,
}: {
  id: string;
  /** Le choix vient de l'adresse : sans cela, aucun panneau ne s'ouvre de lui-même. */
  asked: boolean;
  onClose: () => void;
  back: ReactNode;
  children: ReactNode;
}) {
  const overlay = useMaxWidth(OVERLAY_MAX);
  const phone = useMaxWidth(PHONE_MAX);
  if (!overlay) {
    return (
      <aside aria-label={LABEL} className={ASIDE}>
        {children}
      </aside>
    );
  }
  if (!asked) return null;
  if (phone) {
    return (
      <aside aria-label={LABEL} className="flex w-full min-w-0 flex-col gap-3 px-4 py-4">
        {back}
        {children}
      </aside>
    );
  }
  return (
    <FicheFrame
      id={id}
      onClose={onClose}
      label={LABEL}
      description="Rôle, options comparées et liens du choix technique ouvert."
    >
      {children}
    </FicheFrame>
  );
}
