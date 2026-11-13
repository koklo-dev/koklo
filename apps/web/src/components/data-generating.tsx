"use client";

import { ProposalGenerationBanner, Skeleton } from "@koklo/ui";
import { DATA_GENERATING } from "./features-review.tsx";

/** Positions des six cadres de la maquette 11 (l.649) : colonne, rangée, dans un cadre de 420 de haut. */
const FRAMES = [
  "left-10 top-10",
  "left-[330px] top-40",
  "left-[620px] top-10",
  "left-[330px] top-[300px]",
  "left-[620px] top-[280px]",
  "left-10 top-[260px]",
] as const;

/**
 * Génération du modèle de données (maquette 11 l.105-110) : bandeau d'état « Annuler l'attente » et six cadres de
 * 220 × 110 dans un cadre de 420 de haut ; les cadres ne pulsent qu'avec `motion-safe`. Sous 375 px, le cadre défile.
 */
export function DataGenerating({ onLeave }: { onLeave: () => void }) {
  return (
    <>
      <ProposalGenerationBanner onLeave={onLeave}>{DATA_GENERATING}</ProposalGenerationBanner>
      <div className="px-4 py-5 md:px-7">
        <div
          aria-hidden="true"
          data-slot="data-generating"
          className="relative h-[420px] overflow-hidden rounded-xl border border-border bg-surface"
        >
          {FRAMES.map((position) => (
            <Skeleton
              key={position}
              className={`absolute h-[110px] w-[220px] rounded-[10px] border border-border bg-background ${position}`}
            />
          ))}
        </div>
      </div>
    </>
  );
}
