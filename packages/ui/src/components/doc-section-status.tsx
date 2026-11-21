import type { HTMLAttributes } from "react";
import { Icon, type IconName } from "../icons/icon.tsx";
import { cn } from "../lib/cn.ts";
import { STATUS_PILL, STATUS_TONE } from "./status-pill.ts";

/** Statuts d'une section du document d'architecture (`architecture/overview/NN-<slug>.md`, front matter `statut:`). */
export type DocSectionStatusValue = "validee" | "a_relire" | "brouillon" | "a_rediger";

export const DOC_SECTION_STATUSES = ["validee", "a_relire", "brouillon", "a_rediger"] as const;

const STATUS: Record<DocSectionStatusValue, { label: string; icon: IconName }> = {
  validee: { label: "Validée", icon: "check_circle" },
  a_relire: { label: "À relire", icon: "rate_review" },
  brouillon: { label: "Brouillon", icon: "edit" },
  a_rediger: { label: "À rédiger", icon: "radio_button_unchecked" },
};

export const docSectionStatusLabel = (status: DocSectionStatusValue): string =>
  STATUS[status].label;

export interface DocSectionStatusProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  status: DocSectionStatusValue;
  /**
   * `inline` : icône 16 puis libellé estompé (légende) ; `icon` : l'icône seule dans une liste, le libellé reste lu
   * par les lecteurs d'écran ; `pill` : pastille 24 px du titre de la section (maquette 13 l.287).
   */
  display?: "inline" | "icon" | "pill";
}

/**
 * Statut d'une section du document d'architecture (DESIGN.md §5.22, maquette 13 l.264-271, 764) : Validée en
 * `check_circle` plein `--primary`, À relire `rate_review`, Brouillon `edit`, À rédiger `radio_button_unchecked`.
 * Le libellé est toujours écrit (visible ou réservé aux lecteurs d'écran) : jamais la seule icône.
 */
export function DocSectionStatus({
  status,
  display = "inline",
  className,
  ...props
}: DocSectionStatusProps) {
  const { label, icon } = STATUS[status];
  const validated = status === "validee";
  const glyph = (
    <Icon
      name={icon}
      size={16}
      fill={validated}
      className={cn("shrink-0", validated && display === "icon" ? "text-primary" : "")}
    />
  );
  if (display === "icon") {
    return (
      <span
        data-slot="doc-section-status"
        data-status={status}
        className={cn("inline-flex", !validated && "text-muted-foreground", className)}
        {...props}
      >
        {glyph}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  if (display === "pill") {
    return (
      <span
        data-slot="doc-section-status"
        data-status={status}
        className={cn(STATUS_PILL, STATUS_TONE[validated ? "validated" : "soft"], className)}
        {...props}
      >
        {glyph}
        {label}
      </span>
    );
  }
  return (
    <span
      data-slot="doc-section-status"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 text-caption font-normal text-muted-foreground",
        className,
      )}
      {...props}
    >
      {glyph}
      {label}
    </span>
  );
}

/** Légende des quatre statuts, collée en bas de la colonne Sections (`margin-top:auto`, maquette 13 l.265-271). */
export function DocSectionLegend({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      data-slot="doc-section-legend"
      aria-label="Légende des statuts"
      className={cn(
        "m-0 mt-auto flex list-none flex-col gap-1.5 rounded-lg bg-surface p-2.5",
        className,
      )}
      {...props}
    >
      {DOC_SECTION_STATUSES.map((status) => (
        <li key={status}>
          <DocSectionStatus status={status} />
        </li>
      ))}
    </ul>
  );
}
