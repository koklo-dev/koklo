"use client";

import type { HTMLAttributes } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { formatCount } from "../lib/format-count.ts";

const PREVIEW_LIMIT = 4;

export interface ZoneNodeProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "onClick"> {
  name: string;
  icon: IconName;
  count: number;
  /** Nom de ce qui est compté, accordé au nombre par l'appelant : « tables », « table ». */
  countLabel: string;
  /** Aperçu : noms des premiers éléments de la zone. */
  preview?: readonly string[];
  /** Résumé des liens sortants : « → 12 liens vers Clients, Paiement… ». */
  links?: string;
  /** Zone ouverte dans la vue. */
  current?: boolean;
  onOpen: () => void;
}

/** Zone d'un diagramme (DESIGN.md v2.1 §5.3, schéma 1.3) : cadre pointillé, nom, icône, compte, aperçu. */
export function ZoneNode({
  name,
  icon,
  count,
  countLabel,
  preview = [],
  links,
  current,
  onOpen,
  className,
  ...props
}: ZoneNodeProps) {
  const hidden = preview.length - PREVIEW_LIMIT;
  return (
    <div
      data-slot="zone-node"
      className={cn(
        "relative flex min-w-0 flex-col items-start gap-1 rounded-xl border border-dashed border-border-strong bg-background p-3 text-left hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-safe:transition-colors",
        current && "border-primary bg-secondary",
        className,
      )}
      {...props}
    >
      {/* Le bouton ne porte que le nom et le compte (Label in Name, 2.5.3) ; son ::after couvre toute la carte. */}
      <button
        type="button"
        aria-label={`Zone ${name} ${formatCount(count)} ${countLabel}`}
        aria-pressed={current}
        className="flex flex-col items-start gap-1 text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
        onClick={onOpen}
      >
        <span className="flex items-center gap-2 text-subsection-title text-foreground">
          <Icon name={icon} size={20} className="text-primary" />
          {name}
        </span>{" "}
        <span className="text-meta text-muted-foreground">{`${formatCount(count)} ${countLabel}`}</span>
      </button>
      {preview.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {preview.slice(0, PREVIEW_LIMIT).map((item) => (
            <span
              key={item}
              className="rounded-sm border bg-surface px-1.5 font-mono text-code text-muted-foreground"
            >
              {item}
            </span>
          ))}
          {hidden > 0 ? (
            <span className="rounded-sm px-1.5 font-mono text-code text-muted-foreground">{`+${hidden}`}</span>
          ) : null}
        </span>
      ) : null}
      {links ? <span className="text-meta text-muted-foreground">{links}</span> : null}
    </div>
  );
}
