import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.ts";

export type PriorityLevel = 0 | 1 | 2 | 3;

/** Hauteurs des 3 barres (4, 8, 12 px), alignées en bas. */
const BARS = ["h-1", "h-2", "h-3"] as const;
/** Variante `barsOnly` (planche 12) : barres de 4 px et de 6, 10, 14 px de haut. */
const BARS_ONLY = ["h-1.5", "h-2.5", "h-3.5"] as const;

export interface PriorityIndicatorProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  level: PriorityLevel;
  /** Libellé de l'écran (fonctionnalité ou ticket, B23) : il porte le sens, les barres sont décoratives. */
  label: string;
  /**
   * Barres seules (planche 12, ligne de liste) : 4 px de large, 6, 10 et 14 px de haut, actives en `--primary` ;
   * le libellé n'est plus visible, il devient le nom accessible (`role="img"`).
   */
  barsOnly?: boolean;
}

/** Priorité (DESIGN.md v2 §5.1) : 3 barres actives en `--foreground`, inactives en `--border-strong`. */
export function PriorityIndicator({
  level,
  label,
  barsOnly = false,
  className,
  ...props
}: PriorityIndicatorProps) {
  if (barsOnly) {
    return (
      <span
        data-slot="priority-indicator"
        data-level={level}
        role="img"
        aria-label={label}
        className={cn("inline-flex h-3.5 items-end gap-0.5", className)}
        {...props}
      >
        {BARS_ONLY.map((height, i) => (
          <span
            key={height}
            aria-hidden="true"
            data-active={i < level ? "true" : "false"}
            className={cn(
              "w-1 rounded-[1px]",
              height,
              i < level ? "bg-primary" : "bg-border-strong",
            )}
          />
        ))}
      </span>
    );
  }
  return (
    <span
      data-slot="priority-indicator"
      data-level={level}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-meta font-medium text-foreground",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="inline-flex h-3 items-end gap-0.5">
        {BARS.map((height, i) => (
          <span
            key={height}
            data-active={i < level ? "true" : "false"}
            className={cn(
              "w-[3px] rounded-[1px]",
              height,
              i < level ? "bg-foreground" : "bg-border-strong",
            )}
          />
        ))}
      </span>
      {label}
    </span>
  );
}
