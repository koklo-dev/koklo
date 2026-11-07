import type { HTMLAttributes, ReactElement } from "react";
import type { IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { IconTile } from "./icon-tile.tsx";

export type EmptyStateVariant = "framed" | "inline";

export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "children"> {
  icon: IconName;
  title: string;
  description: string;
  /** `framed` : cadre pointillé et tuile (défaut) ; `inline` : sans cadre ni tuile, dans une liste. */
  variant?: EmptyStateVariant;
  /** Une seule action principale : le type ne prend pas de liste. */
  action?: ReactElement;
  /** Au plus une action secondaire, après la principale. */
  secondaryAction?: ReactElement;
}

const FRAME: Record<EmptyStateVariant, string> = {
  framed: "rounded-xl border border-dashed border-border-strong bg-surface px-5 py-7",
  inline: "px-4 py-6",
};

/**
 * État vide (DESIGN.md §5.6) : cadre pointillé sur `--surface`, `IconTile 48` décorative, titre 14/600 en
 * `p` (ce n'est pas un titre de section : le plan reste intact), une phrase, une action principale et au
 * plus une secondaire.
 */
export function EmptyState({
  icon,
  title,
  description,
  variant = "framed",
  action,
  secondaryAction,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      data-variant={variant}
      className={cn("flex flex-col items-center gap-2.5 text-center", FRAME[variant], className)}
      {...props}
    >
      {variant === "framed" ? <IconTile icon={icon} size={48} /> : null}
      <p className="text-subsection-title text-foreground">{title}</p>
      <p className="max-w-[280px] text-meta text-muted-foreground">{description}</p>
      {action || secondaryAction ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
