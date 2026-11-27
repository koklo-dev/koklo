"use client";

import { TECHNICAL_GENERATING } from "../lib/technical-labels.ts";
import { DataGenerating } from "./data-generating.tsx";

/** Cadres de la maquette 14 (l.839) : trois puis deux cartes, deux bandes, dans un cadre de 440 de haut. */
const FRAMES = [
  "left-10 top-[30px] h-[110px] w-[220px]",
  "left-[280px] top-[30px] h-[110px] w-[220px]",
  "left-[520px] top-[30px] h-[110px] w-[220px]",
  "left-10 top-[170px] h-[110px] w-[220px]",
  "left-[280px] top-[170px] h-[110px] w-[220px]",
  "left-10 top-[310px] h-11 w-[700px]",
  "left-10 top-[370px] h-11 w-[700px]",
];

/** Génération du cahier technique (maquette 14 l.104-109) : bandeau d'état « Annuler l'attente » et squelette. */
export function TechnicalGenerating({
  onLeave,
  detail,
}: {
  onLeave: () => void;
  /** « Étapes traitées 4/9 · écartées 1 » (DESIGN §5.25). */
  detail?: string | undefined;
}) {
  return (
    <DataGenerating
      onLeave={onLeave}
      detail={detail}
      text={TECHNICAL_GENERATING}
      heightClass="h-[440px]"
      frames={FRAMES}
    />
  );
}
