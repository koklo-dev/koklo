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
  | "nfr";

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
};

export interface EntityPreview {
  title: string;
  summary: string;
}

export interface EntityChipProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children" | "title"> {
  kind: EntityKind;
  id: string;
  title?: string;
  /**
   * Un vrai lien : l'aperçu n'est jamais le seul accès à l'information. Sans `href` (cible sans page, comme les liens
   * d'une fiche vers des tables ou des exigences), la pastille n'est qu'une étiquette, ni lien ni focusable.
   */
  href?: string;
  preview?: EntityPreview;
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
  className,
  ...props
}: EntityChipProps) {
  // Type hors union (contournement du typage) : un simple lien plutôt qu'une exception au rendu.
  const { icon, type } = KIND[kind] ?? { icon: "link", type: "" };
  const Tag = href === undefined ? "span" : "a";
  const chip = (
    <Tag
      data-slot="entity-chip"
      {...(href === undefined ? {} : { href })}
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-md bg-secondary pr-2 pl-1.5 text-secondary-foreground motion-safe:transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        href !== undefined && "hover:bg-secondary/80",
        className,
      )}
      {...props}
    >
      <Icon name={icon} size={16} />
      {/* Espaces explicites : le nom accessible se lit « Fonctionnalité F-001 Connexion ». */}
      {type ? <span className="sr-only">{type}</span> : null}{" "}
      <span className="font-mono text-code">{id}</span>
      {title ? (
        <>
          {" "}
          <span className="text-caption font-normal text-foreground">{title}</span>
        </>
      ) : null}
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
