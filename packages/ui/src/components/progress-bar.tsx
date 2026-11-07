import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

export type ProgressBarSize = "md" | "lg";

const SIZE: Record<ProgressBarSize, string> = {
  md: "h-1.5 rounded-[3px]",
  lg: "h-2 rounded-[4px]",
};

type NameProps =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-labelledby": string; "aria-label"?: string };

export type ProgressBarProps = Omit<
  ComponentProps<"div">,
  "role" | "children" | "aria-label" | "aria-labelledby"
> &
  NameProps & {
    /** Pourcentage, borné à 0..100. */
    value: number;
    size?: ProgressBarSize;
  };

/**
 * Jauge de progression (DESIGN.md §5.6) : piste `--border-strong`, remplissage `--primary`. Le nom
 * accessible est obligatoire ; la valeur s'écrit aussi en texte à côté (jamais la couleur seule).
 */
export function ProgressBar({ value, size = "md", className, ...props }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      data-slot="progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("w-full overflow-hidden bg-border-strong", SIZE[size], className)}
      {...props}
    >
      <div className="h-full bg-primary" style={{ width: `${clamped}%` }} />
    </div>
  );
}
