"use client";

import type { AnchorHTMLAttributes } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card.tsx";

export type EntityKind =
  | "feature"
  | "screen"
  | "ticket"
  | "role"
  | "table"
  | "rule"
  | "endpoint"
  | "commit"
  | "nfr"
  | "component"
  | "decision"
  | "flow"
  | "permission"
  | "limit";

/** Icône (DESIGN.md v2 §4) et type lu par les lecteurs d'écran (questions.md B32). */
const KIND: Record<EntityKind, { icon: IconName; type: string }> = {
  feature: { icon: "task_alt", type: "Fonctionnalité" },
  screen: { icon: "web", type: "Écran" },
  ticket: { icon: "view_kanban", type: "Ticket" },
  role: { icon: "person", type: "Rôle" },
  table: { icon: "table", type: "Table" },
  rule: { icon: "gavel", type: "Règle métier" },
  endpoint: { icon: "api", type: "Point d'accès" },
  commit: { icon: "commit", type: "Commit" },
  nfr: { icon: "speed", type: "Exigence non fonctionnelle" },
  component: { icon: "widgets", type: "Composant" },
  decision: { icon: "gavel", type: "Décision d'architecture" },
  flow: { icon: "route", type: "Flux" },
  permission: { icon: "person", type: "Rôle autorisé" },
  limit: { icon: "speed", type: "Limite de débit" },
};

/** `soft` (défaut) : fond --secondary, identifiant mono ; `outline` : bordée sans fond, 12/500 (maquette 15 l.818). */
const VARIANT = {
  soft: {
    chip: "gap-1.5 bg-secondary pr-2 pl-1.5 text-secondary-foreground",
    hover: "hover:bg-secondary/80",
    icon: "",
    id: "font-mono text-code",
    title: "font-normal",
  },
  outline: {
    chip: "gap-[5px] border border-border bg-transparent pr-[9px] pl-[7px] text-foreground",
    hover: "hover:bg-secondary",
    icon: "text-muted-foreground",
    id: "font-sans text-caption font-medium",
    title: "font-medium",
  },
} as const;

export interface EntityPreview {
  title: string;
  summary: string;
}

export interface EntityChipProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children" | "title"> {
  kind: EntityKind;
  /** Vide : la pastille ne porte que son libellé (appelants suivants d'une opération). */
  id: string;
  title?: string;
  /** Icône qui remplace celle du type (règle d'une opération : « rule », DESIGN.md §5.27). */
  icon?: IconName;
  /**
   * Un vrai lien : l'aperçu n'est jamais le seul accès à l'information. Sans `href` (cible sans page, comme les liens
   * d'une fiche vers des tables ou des exigences), la pastille n'est qu'une étiquette, ni lien ni focusable.
   */
  href?: string;
  preview?: EntityPreview;
  variant?: keyof typeof VARIANT;
}

/** Contenu d'un aperçu d'entité : titre 14/600 et une ligne de résumé. */
export function EntityPreviewBody({ title, summary }: EntityPreview) {
  return (
    <>
      <p className="text-subsection-title text-foreground">{title}</p>
      <p className="mt-1 text-meta text-muted-foreground">{summary}</p>
    </>
  );
}

/** Identifiant cliquable d'une entité (DESIGN.md v2 §5.1), avec aperçu au survol et au focus. */
export function EntityChip({
  kind,
  id,
  title,
  href,
  preview,
  icon: replaced,
  variant = "soft",
  className,
  ...props
}: EntityChipProps) {
  // Type hors union (contournement du typage) : un simple lien plutôt qu'une exception au rendu.
  const { icon, type } = KIND[kind] ?? { icon: "link", type: "" };
  const Tag = href === undefined ? "span" : "a";
  const look = VARIANT[variant];
  const chip = (
    <Tag
      data-slot="entity-chip"
      {...(href === undefined ? {} : { href })}
      className={cn(
        "inline-flex min-h-[26px] max-w-full items-center rounded-md py-0.5 motion-safe:transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        look.chip,
        href !== undefined && look.hover,
        className,
      )}
      {...props}
    >
      <Icon name={replaced ?? icon} size={16} className={look.icon} />
      {/* Espaces explicites : le nom accessible se lit « Fonctionnalité F-001 Connexion ». */}
      {type ? <span className="sr-only">{type}</span> : null}{" "}
      {/* Le libellé passe à la ligne ; un identifiant plus large que la pastille est tronqué. */}
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
        {id ? (
          <span title={id} className={cn("min-w-0 max-w-full truncate", look.id)}>
            {id}
          </span>
        ) : null}
        {title ? (
          <>
            {" "}
            <span className={cn("min-w-0 break-words text-caption text-foreground", look.title)}>
              {title}
            </span>
          </>
        ) : null}
      </span>
    </Tag>
  );
  if (!preview) return chip;
  return (
    <HoverCard>
      <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
      <HoverCardContent>
        <EntityPreviewBody {...preview} />
      </HoverCardContent>
    </HoverCard>
  );
}
