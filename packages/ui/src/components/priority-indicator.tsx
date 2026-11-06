import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.ts";

export type PriorityLevel = 0 | 1 | 2 | 3;

/** Hauteurs des 3 barres (4, 8, 12 px), alignées en bas. */
const BARS = ["h-1", "h-2", "h-3"] as const;

export interface PriorityIndicatorProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  level: PriorityLevel;
  /** Libellé de l'écran (fonctionnalité ou ticket, B23) : il porte le sens, les barres sont décoratives. */
  label: string;
}

/** Priorité (DESIGN.md v2 §5.1) : 3 barres actives en `--foreground`, inactives en `--border-strong`. */
export function PriorityIndicator({ level, label, className, ...props }: PriorityIndicatorProps) {
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
