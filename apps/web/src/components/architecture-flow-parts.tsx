"use client";

import { IdTag, IdTitle, ListRow } from "@koklo/ui";

interface Flow {
  specId: string;
  title: string;
  actor: string;
  componentCount: number;
  externalCount: number;
}

const counted = (count: number, noun: string) => `${count} ${count > 1 ? `${noun}s` : noun}`;

/**
 * Ligne d'un flux (maquette 13 l.407-412), équipe et client : identifiant et titre, puis acteur, composants et externes.
 * 52 de haut au moins : sous un identifiant long, le titre passe à la ligne (B708, B709).
 */
export function FlowRow({
  row,
  selected,
  onSelect,
}: {
  row: Flow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <ListRow
      fixedHeight="min"
      selected={selected}
      title={<IdTitle id={row.specId} title={row.title} size="sm" clipTitle />}
      subtitle={`${row.actor} · ${counted(row.componentCount, "composant")}, ${counted(row.externalCount, "externe")}`}
      onSelect={onSelect}
    />
  );
}

/** Tête du détail d'un flux (maquette 13 l.414) : identifiant tronqué s'il est long, titre entier. */
export function FlowHeading({ id, title }: { id: string; title: string }) {
  return (
    <>
      <IdTag truncate>{id}</IdTag>
      <h2 className="m-0 min-w-0 text-section-title [overflow-wrap:anywhere]">{title}</h2>
    </>
  );
}
