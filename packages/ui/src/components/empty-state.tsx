import type { HTMLAttributes, ReactElement } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
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
  /** `inline` seulement : cadre plein de la liste (bordure et rayon 12, fond de page), pour un état vide qui remplace la liste. */
  bordered?: boolean;
  /** Une seule action principale : le type ne prend pas de liste. */
  action?: ReactElement;
  /** Au plus une action secondaire, après la principale. */
  secondaryAction?: ReactElement;
}

const FRAME: Record<EmptyStateVariant, string> = {
  framed: "rounded-xl border border-dashed border-border-strong bg-surface px-5 py-7",
  inline: "gap-2 px-6 py-16",
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
  bordered = false,
  action,
  secondaryAction,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      data-variant={variant}
      className={cn(
        "flex flex-col items-center gap-2.5 text-center",
        FRAME[variant],
        variant === "inline" && bordered && "rounded-xl border border-border bg-background",
        className,
      )}
      {...props}
    >
      {variant === "framed" ? (
        <IconTile icon={icon} size={48} />
      ) : (
        <Icon name={icon} size={28} className="text-muted-foreground" />
      )}
      <p className="text-subsection-title text-foreground">{title}</p>
      <p className={cn("text-meta text-muted-foreground", variant === "framed" && "max-w-[280px]")}>
        {description}
      </p>
      {action || secondaryAction ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-center gap-2",
            variant === "inline" && "mt-1",
          )}
        >
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
