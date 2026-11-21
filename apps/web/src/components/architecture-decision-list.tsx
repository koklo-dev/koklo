"use client";

import {
  cn,
  DecisionStatus,
  type DecisionStatusValue,
  Icon,
  IdTag,
  ListPanel,
  ListRow,
} from "@koklo/ui";
import type { ReactNode } from "react";
import { DECISIONS_LIST_LABEL } from "../lib/architecture-labels.ts";
import { shortDate } from "../lib/overview-labels.ts";

/** « Liste » : retour du détail à la liste sous 768 px (une colonne à la fois, fiche §7). */
export function BackToList({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center gap-1.5 self-start rounded-md px-1 font-medium text-primary text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
    >
      <Icon name="chevron_left" size={18} />
      Liste
    </button>
  );
}

/** Une ligne de la liste : l'équipe (`adr.list`) et le client (`clientSpace.adrs`) la remplissent pareillement. */
export interface DecisionRowData {
  id: string;
  title: string;
  status: DecisionStatusValue;
  date: string;
  links?: readonly string[];
}

/** « 12 oct. · C-api, C-db, F-001 » (maquette 13 l.802-806) : date et les trois premiers liens. */
const subtitleOf = (row: DecisionRowData): string =>
  [
    shortDate(row.date),
    ...(row.links && row.links.length > 0 ? [row.links.slice(0, 3).join(", ")] : []),
  ].join(" · ");

/** Lignes de décisions (maquette 13 l.376-386) : identifiant, titre, date et liens, statut écrit ; le titre d'une remplacée est à 70 %. */
export function ArchitectureDecisionList({
  rows,
  selected,
  onSelect,
  footer,
  className,
}: {
  rows: readonly DecisionRowData[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  footer: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <ListPanel
        label={DECISIONS_LIST_LABEL}
        className="max-h-[720px] overflow-auto rounded-b-none"
      >
        {rows.map((row) => (
          <ListRow
            wrap
            key={row.id}
            selected={row.id === selected}
            leading={<IdTag>{row.id}</IdTag>}
            title={
              // La maquette atténue la ligne à 70 % ; seul le titre l'est : une ligne entière passerait sous 4,5:1 (WCAG 1.4.3).
              <span className={cn(row.status === "remplacee" && "opacity-70")}>{row.title}</span>
            }
            subtitle={subtitleOf(row)}
            trailing={<DecisionStatus status={row.status} />}
            onSelect={() => onSelect(row.id)}
          />
        ))}
      </ListPanel>
      {footer}
    </div>
  );
}
