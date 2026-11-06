import type { HTMLAttributes, ReactElement } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";

export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "children"> {
  icon: IconName;
  title: string;
  description: string;
  /** Une seule action principale : le type ne prend pas de liste. */
  action?: ReactElement;
}

/**
 * État vide (DESIGN.md v2 §5.1) : cadre pointillé sur `--surface`, tuile d'icône décorative, titre 14/600 en
 * `p` (ce n'est pas un titre de section : le plan reste intact), une phrase et au plus une action.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface px-5 py-7 text-center",
        className,
      )}
      {...props}
    >
      <span className="mb-1 flex size-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <Icon name={icon} size={28} />
      </span>
      <p className="text-subsection-title text-foreground">{title}</p>
      <p className="max-w-[280px] text-meta text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
