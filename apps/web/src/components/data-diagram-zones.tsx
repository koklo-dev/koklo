"use client";

import { Kbd, SearchField, ZoneNode as ZoneCard } from "@koklo/ui";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  linksLabel,
  type NeighborNode,
  tablesLabel,
  type ZoneNode,
} from "../lib/data-diagram-zones.ts";
import type { DiagramCard } from "../lib/data-mermaid.ts";

/** Aperçu de la carte de zone : 7 noms puis « +N » (maquette 11 l.484). */
const PREVIEW = 7;

export const zoneHint = (tables: number, zones: number) =>
  `Vue des zones : ${tablesLabel(tables)} réparties en ${zones} zones. Cliquez une zone pour voir ses tables.`;

/** Carte d'une zone dans la vue des zones : cadre pointillé, compte, aperçu ; un clic ouvre la zone. */
export function renderZone(node: ZoneNode, context: { onSelect: () => void }, reviewing: boolean) {
  const { zone } = node;
  const pending = reviewing && zone.pending > 0 ? `${zone.pending} à relire · ` : "";
  return (
    <ZoneCard
      name={zone.id}
      icon="folder_open"
      count={zone.tableIds.length}
      countLabel={zone.tableIds.length > 1 ? "tables" : "table"}
      detail={`${pending}cliquez pour ouvrir`}
      preview={zone.names}
      previewLimit={PREVIEW}
      arrow
      onOpen={context.onSelect}
      style={{ height: node.height }}
      className="w-full overflow-hidden"
    />
  );
}

/** Carte d'une zone voisine dans une zone ouverte (B480) : nom, tables, relations ; un clic passe à cette zone. */
export function renderNeighbor(node: NeighborNode, context: { onSelect: () => void }) {
  const { zone, tables, links } = node.neighbor;
  return (
    <ZoneCard
      name={zone}
      icon="folder_open"
      count={tables}
      countLabel={tables > 1 ? "tables" : "table"}
      detail={`${links > 1 ? `${links} relations` : "1 relation"} · ouvrir`}
      arrow
      onOpen={context.onSelect}
      style={{ height: node.height }}
      className="w-full overflow-hidden bg-surface"
    />
  );
}

/** Fil du diagramme (maquette 11 l.170) : « Toutes les zones · N tables » / zone ouverte · compte · liens sortants. */
function ZoneCrumbs({
  total,
  zone,
  count,
  crossLinks,
  onAll,
}: {
  total: number;
  zone: string | null;
  count: number;
  crossLinks: number;
  onAll: () => void;
}) {
  const all = `Toutes les zones · ${tablesLabel(total)}`;
  return (
    <nav aria-label="Fil du diagramme" className="flex min-w-0 flex-wrap items-center gap-1.5">
      {zone === null ? (
        <span aria-current="page" className="px-1.5 font-semibold">
          {all}
        </span>
      ) : (
        <>
          <button
            type="button"
            onClick={onAll}
            className="h-7 rounded-md px-1.5 font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {all}
          </button>
          <span aria-hidden="true" className="text-muted-foreground">
            /
          </span>
          <span aria-current="page" className="font-semibold">
            {zone}
          </span>
          <span className="text-caption text-muted-foreground">
            {`· ${tablesLabel(count)}${crossLinks > 0 ? ` · ${linksLabel(crossLinks)}` : ""}`}
          </span>
        </>
      )}
    </nav>
  );
}

/** « Aller à une table… » : nom ou identifiant d'une table du modèle, `/` y amène le focus. */
function TableJump({
  cards,
  onPick,
}: {
  cards: readonly DiagramCard[];
  onPick: (card: DiagramCard) => void;
}) {
  const listId = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      if (event.key !== "/" || typing || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const find = (text: string) => {
    const wanted = text.trim().toLocaleLowerCase("fr");
    return cards.find(
      (card) => card.name.toLocaleLowerCase("fr") === wanted || card.id.toLowerCase() === wanted,
    );
  };
  const pick = (text: string) => {
    const card = find(text);
    if (!card) return false;
    onPick(card);
    setValue("");
    return true;
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    pick(value);
  };
  return (
    <form onSubmit={onSubmit} className="relative w-[260px] max-sm:w-full">
      <SearchField
        ref={ref}
        label="Aller à une table"
        placeholder="Aller à une table…"
        list={listId}
        value={value}
        autoComplete="off"
        className="[&_input]:pr-8"
        onChange={(event) => {
          const next = event.currentTarget.value;
          // Une suggestion choisie dans la liste (pas une frappe) remplit le champ d'un nom exact : on y va tout de suite.
          const typed = (event.nativeEvent as InputEvent).inputType;
          const chosen = typed === undefined || typed === "insertReplacementText";
          if (!(chosen && pick(next))) setValue(next);
        }}
      />
      <Kbd
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
      >
        /
      </Kbd>
      <datalist id={listId}>
        {cards.map((card) => (
          <option key={card.id} value={card.name}>
            {card.id}
          </option>
        ))}
      </datalist>
    </form>
  );
}

/** Barre au-dessus du diagramme par zones : fil et « Aller à une table… ». */
export function ZoneBar(props: {
  total: number;
  zone: string | null;
  count: number;
  crossLinks: number;
  cards: readonly DiagramCard[];
  onAll: () => void;
  onPick: (card: DiagramCard) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-meta">
      <ZoneCrumbs {...props} />
      <span className="flex-1" />
      <TableJump cards={props.cards} onPick={props.onPick} />
    </div>
  );
}
