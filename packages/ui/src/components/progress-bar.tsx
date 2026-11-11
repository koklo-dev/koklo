import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

export type ProgressBarSize = "md" | "lg";
/** `split` : deux segments, la valeur (`--primary`) puis `secondary` (`--muted-foreground` à 50 %), maquette 10 l.119. */
export type ProgressBarVariant = "default" | "split";

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
    variant?: ProgressBarVariant;
    /** Pourcentage du second segment de la variante `split` ; borné pour que les deux ne dépassent pas 100. */
    secondary?: number;
  };

/**
 * Jauge de progression (DESIGN.md §5.6) : piste `--border-strong`, remplissage `--primary`. Le nom
 * accessible est obligatoire ; la valeur s'écrit aussi en texte à côté (jamais la couleur seule).
 */
const percent = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

export function ProgressBar({
  value,
  size = "md",
  variant = "default",
  secondary = 0,
  className,
  ...props
}: ProgressBarProps) {
  const clamped = percent(value);
  const second = Math.min(percent(secondary), 100 - clamped);
  return (
    <div
      data-slot="progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn(
        "w-full overflow-hidden bg-border-strong",
        variant === "split" && "flex",
        SIZE[size],
        className,
      )}
      {...props}
    >
      <div className="h-full bg-primary" style={{ width: `${clamped}%` }} />
      {variant === "split" ? (
        <div className="h-full bg-muted-foreground opacity-50" style={{ width: `${second}%` }} />
      ) : null}
    </div>
  );
}
