"use client";

import { useCallback, useEffect, useState } from "react";
import type { BriefFields } from "./framing-types.ts";

/** Ce que l'écran garde en mémoire sans le sauvegarder dans le brouillon (S-framing §3, §4). */
interface FramingView {
  /** Champs du brief encore tels que proposés par l'IA (badge « Proposé par l'IA »). */
  aiFields: Array<keyof BriefFields>;
  /** Ligne technique « Modèle : ... » (équipe seulement, repliée). */
  technical: string | null;
  /** L'idée est repliée en résumé « Idée de N caractères » (brief produit pendant cette session). */
  ideaCollapsed: boolean;
  /** Une demande de propositions est revenue vide. */
  emptyResult: boolean;
  /** Les champs de réponse aux questions ouvertes sont ouverts. */
  answering: boolean;
  /** Dernière annonce de la région d'état (brief prêt, statut d'une carte...). */
  notice: string;
  confirming: boolean;
  replacing: boolean;
  abandoning: boolean;
  focus: { id: string; tick: number } | null;
}

const INITIAL: FramingView = {
  aiFields: [],
  technical: null,
  ideaCollapsed: false,
  emptyResult: false,
  answering: false,
  notice: "",
  confirming: false,
  replacing: false,
  abandoning: false,
  focus: null,
};

/** Place le focus sur un élément par son identifiant, une fois le rendu fait. */
export function useFramingView() {
  const [view, setView] = useState<FramingView>(INITIAL);
  const patch = useCallback(
    (next: Partial<FramingView>) => setView((current) => ({ ...current, ...next })),
    [],
  );
  const focusOn = useCallback(
    (id: string) =>
      setView((current) => ({ ...current, focus: { id, tick: (current.focus?.tick ?? 0) + 1 } })),
    [],
  );
  const { focus } = view;
  useEffect(() => {
    if (focus) document.getElementById(focus.id)?.focus();
  }, [focus]);
  return { view, patch, focusOn };
}

export type ViewModel = ReturnType<typeof useFramingView>;
