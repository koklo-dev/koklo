"use client";

import { ARCHITECTURE_GENERATING } from "../lib/architecture-labels.ts";
import { DataGenerating } from "./data-generating.tsx";

/** Cadres de la maquette 13 (l.917) : [x, y, largeur, hauteur], rayon 10, dans un cadre de 440 de haut. */
const ARCH_FRAMES = [
  "left-10 top-[30px] h-11 w-[160px]",
  "left-[300px] top-[30px] h-11 w-[160px]",
  "left-10 top-[140px] h-16 w-[220px]",
  "left-[420px] top-[140px] h-16 w-[220px]",
  "left-10 top-[280px] h-16 w-[200px]",
  "left-[280px] top-[280px] h-16 w-[200px]",
  "left-[520px] top-[280px] h-16 w-[200px]",
];

/**
 * Génération de l'architecture (maquette 13 l.104-109) : bandeau d'état « Annuler l'attente » et sept cadres dans un
 * cadre de 440 de haut ; les cadres ne pulsent qu'avec `motion-safe`.
 */
export function ArchitectureGenerating({ onLeave }: { onLeave: () => void }) {
  return (
    <DataGenerating
      onLeave={onLeave}
      text={ARCHITECTURE_GENERATING}
      heightClass="h-[440px]"
      frames={ARCH_FRAMES}
    />
  );
}
