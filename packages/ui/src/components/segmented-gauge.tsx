import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

/** Nombre de crans au plus d'une jauge proportionnelle (DESIGN.md §5.11). */
export const GAUGE_MAX_CELLS = 12;

export type SegmentedGaugeProps = Omit<ComponentProps<"span">, "children"> & {
  done: number;
  total: number;
  /** Hauteur des crans : 6 (cartes d'indicateur), 5 (cartes de livrable). */
  height?: 5 | 6;
  /** `validated` : livrable validé, remplissage en vert de statut ; `primary` sinon. */
  tone?: "primary" | "validated";
  /** Un cran par unité de `total`, sans plafond ni proportion, de largeur fixe 10 (variante `MaturityMeter`). */
  exact?: boolean;
  /** Faux : la jauge porte un rôle et un nom (le parent les passe) ; vrai par défaut, la valeur est écrite à côté. */
  decorative?: boolean;
};

/** Nombre de crans dessinés et nombre de crans atteints pour `done` sur `total`. */
export function gaugeCells(
  done: number,
  total: number,
  exact: boolean,
): { cells: number; reached: number } {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeDone = Math.min(Math.max(done, 0), safeTotal);
  if (exact) return { cells: safeTotal, reached: Math.floor(safeDone) };
  const cells = Math.min(safeTotal, GAUGE_MAX_CELLS);
  return { cells, reached: safeTotal === 0 ? 0 : Math.round((safeDone / safeTotal) * cells) };
}

/**
 * Jauge à crans (DESIGN.md §5.11, maquette 07 l.118 et l.140) : crans `flex-1`, rayon 2, écart 3, 12 au plus ;
 * atteints `--primary`, restants `--border-strong`. Décorative : la valeur s'écrit à côté, jamais la couleur seule.
 */
export function SegmentedGauge({
  done,
  total,
  height = 6,
  tone = "primary",
  exact = false,
  decorative = true,
  className,
  ...props
}: SegmentedGaugeProps) {
  const { cells, reached } = gaugeCells(done, total, exact);
  return (
    <span
      data-slot="segmented-gauge"
      aria-hidden={decorative ? "true" : undefined}
      className={cn("flex gap-[3px]", exact && "flex-wrap", className)}
      {...props}
    >
      {Array.from({ length: cells }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: crans identiques, jamais réordonnés
          key={index}
          data-reached={index < reached ? "true" : "false"}
          className={cn(
            "rounded-[2px]",
            height === 6 ? "h-1.5" : "h-[5px]",
            exact ? "w-2.5" : "flex-1",
            index < reached
              ? tone === "validated"
                ? "bg-status-validated-foreground"
                : "bg-primary"
              : "bg-border-strong",
          )}
        />
      ))}
    </span>
  );
}
