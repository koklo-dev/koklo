import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

export type ProgressBarSize = "md" | "lg";
/** `split` : deux segments, la valeur (`--primary`) puis `secondary` (`--muted-foreground` à 50 %), maquette 10 l.119. */
export type ProgressBarVariant = "default" | "split";
/** Teinte du remplissage : `primary` (`--primary`) ou `success` (vert de « Validé », `--status-validated-fg`). */
export type ProgressBarTone = "primary" | "success";

const TONE: Record<ProgressBarTone, string> = {
  primary: "bg-primary",
  success: "bg-status-validated-foreground",
};

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
    tone?: ProgressBarTone;
    /**
     * Pourcentage en cours, à la suite de la valeur : même teinte, à moitié opaque, qui pulse (sauf mouvement réduit).
     * Sert à montrer la part qui s'enregistre pendant l'attente d'une réponse.
     */
    pending?: number;
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
  tone = "primary",
  pending = 0,
  className,
  ...props
}: ProgressBarProps) {
  const clamped = percent(value);
  const running = Math.min(percent(pending), 100 - clamped);
  const second = Math.min(percent(secondary), 100 - clamped - running);
  return (
    <div
      data-slot="progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn(
        "w-full overflow-hidden bg-border-strong",
        (variant === "split" || running > 0) && "flex",
        SIZE[size],
        className,
      )}
      {...props}
    >
      <div className={cn("h-full", TONE[tone])} style={{ width: `${clamped}%` }} />
      {running > 0 ? (
        <div
          data-slot="progress-bar-pending"
          className={cn("h-full opacity-50 motion-safe:animate-pulse", TONE[tone])}
          style={{ width: `${running}%` }}
        />
      ) : null}
      {variant === "split" ? (
        <div className="h-full bg-muted-foreground opacity-50" style={{ width: `${second}%` }} />
      ) : null}
    </div>
  );
}
