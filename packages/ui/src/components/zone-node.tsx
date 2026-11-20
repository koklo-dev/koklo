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
  /** Nombre de noms d'aperçu affichés avant « +N » (4 par défaut ; 7 dans le diagramme des Données, maquette 11). */
  previewLimit?: number;
  /** Suite de la ligne du compte : « 3 à relire · cliquez pour ouvrir ». */
  detail?: string;
  /** Flèche `arrow_forward` après le nom : la carte ouvre une vue (maquette 11 l.193). */
  arrow?: boolean;
  /** Zone ouverte dans la vue. */
  current?: boolean;
  /** `diagram` : carte du diagramme des Données (maquette 11 l.194, l.486) ; `default` : galerie. */
  variant?: "default" | "diagram";
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
  previewLimit = PREVIEW_LIMIT,
  detail,
  arrow,
  current,
  variant = "default",
  onOpen,
  className,
  ...props
}: ZoneNodeProps) {
  const diagram = variant === "diagram";
  const hidden = Math.max(count, preview.length) - Math.min(preview.length, previewLimit);
  const chip = diagram
    ? "rounded-[4px] bg-secondary px-[5px] py-px font-mono text-[10px] leading-4 text-secondary-foreground"
    : "rounded-sm border bg-surface px-1.5 font-mono text-code text-muted-foreground";
  return (
    <div
      data-slot="zone-node"
      className={cn(
        "relative flex min-w-0 flex-col items-start border-dashed border-border-strong bg-background text-left hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-safe:transition-colors",
        diagram
          ? "gap-0.5 rounded-[14px] border-[1.5px] px-4 py-3.5"
          : "gap-1 rounded-xl border p-3",
        current && "border-primary bg-secondary",
        className,
      )}
      {...props}
    >
      {/* Le bouton ne porte que le nom et le compte (Label in Name, 2.5.3) ; son ::after couvre toute la carte. */}
      <button
        type="button"
        aria-label={`Zone ${name} ${formatCount(count)} ${countLabel}${detail ? ` · ${detail}` : ""}`}
        aria-pressed={current}
        className="flex w-full flex-col items-start gap-1 text-left after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none"
        onClick={onOpen}
      >
        <span
          className={cn(
            "flex w-full items-center gap-2 text-foreground",
            diagram ? "text-card-title" : "text-subsection-title",
          )}
        >
          <Icon name={icon} size={20} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1">{name}</span>
          {arrow ? (
            <Icon name="arrow_forward" size={18} className="shrink-0 text-muted-foreground" />
          ) : null}
        </span>{" "}
        <span className="text-meta text-muted-foreground">
          {`${formatCount(count)} ${countLabel}`}
          {detail ? ` · ${detail}` : null}
        </span>
      </button>
      {preview.length > 0 ? (
        <span className={cn("flex flex-wrap gap-1", diagram && "mt-2")}>
          {preview.slice(0, previewLimit).map((item) => (
            <span key={item} className={chip}>
              {item}
            </span>
          ))}
          {hidden > 0 ? (
            <span
              className={
                diagram ? chip : "rounded-sm px-1.5 font-mono text-code text-muted-foreground"
              }
            >{`+${hidden}`}</span>
          ) : null}
        </span>
      ) : null}
      {links ? <span className="text-meta text-muted-foreground">{links}</span> : null}
    </div>
  );
}
