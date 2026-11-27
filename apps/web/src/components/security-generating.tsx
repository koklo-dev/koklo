"use client";

import { SECURITY_GENERATING } from "../lib/security-labels.ts";
import { DataGenerating } from "./data-generating.tsx";

/** Groupes de menaces à venir : un en-tête puis des lignes, dans un cadre de 440 de haut. */
const FRAMES = [
  "left-10 top-[30px] h-11 w-[700px]",
  "left-10 top-[90px] h-11 w-[700px]",
  "left-10 top-[150px] h-11 w-[700px]",
  "left-10 top-[240px] h-[110px] w-[220px]",
  "left-[280px] top-[240px] h-[110px] w-[220px]",
  "left-10 top-[370px] h-11 w-[700px]",
];

/** Génération de la sécurité (design S-spec-security §4) : bandeau d'état « Annuler l'attente » et squelette. */
export function SecurityGenerating({ onLeave }: { onLeave: () => void }) {
  return (
    <DataGenerating
      onLeave={onLeave}
      text={SECURITY_GENERATING}
      heightClass="h-[440px]"
      frames={FRAMES}
    />
  );
}
