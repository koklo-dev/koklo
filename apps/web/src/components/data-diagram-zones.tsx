"use client";

import { EmptyState, iconNameOr, Kbd, SearchField, ZoneNode as ZoneCard } from "@koklo/ui";
import { type FormEvent, useEffect, useId, useRef } from "react";
import {
  linksLabel,
  type NeighborNode,
  tablesLabel,
  type ZoneNode,
} from "../lib/data-diagram-zones.ts";

/** Aperçu de la carte de zone : 7 noms puis « +N » (maquette 11 l.484). */
const PREVIEW = 7;

export const zoneHint = (tables: number, zones: number) =>
  `Vue des zones : ${tablesLabel(tables)} réparties en ${zones} zones. Cliquez une zone pour voir ses tables.`;

/** Carte d'une zone dans la vue des zones : cadre pointillé, compte, aperçu ; un clic ouvre la zone. */
export function renderZone(
  node: ZoneNode,
  context: { onSelect: () => void },
  reviewing: boolean,
  sized = true,
) {
  const { zone } = node;
  const pending = reviewing && zone.pending > 0 ? `${zone.pending} à relire · ` : "";
  return (
    <ZoneCard
      name={zone.name}
      icon={iconNameOr(zone.icon, "folder_open")}
      count={zone.tableCount}
      countLabel={zone.tableCount > 1 ? "tables" : "table"}
      detail={`${pending}cliquez pour ouvrir`}
      preview={zone.preview}
      previewLimit={PREVIEW}
      variant="diagram"
      arrow
      onOpen={context.onSelect}
      style={sized ? { height: node.height } : undefined}
      className="w-full overflow-hidden"
    />
  );
}

/** 375 px : les cartes de zone en une colonne, sans lecteur (fiche §7) ; le lecteur est masqué sous `md`. */
export function ZoneCardList({
  nodes,
  reviewing,
  onOpen,
}: {
  nodes: readonly ZoneNode[];
  reviewing: boolean;
  onOpen: (name: string) => void;
}) {
  return (
    <ul
      // biome-ignore lint/a11y/noRedundantRoles: `list-style: none` retire la sémantique de liste dans Safari / VoiceOver
      role="list"
      aria-label="Zones"
      className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:hidden"
    >
      {nodes.map((node) => (
        <li key={node.id} className="min-h-[180px]">
          {renderZone(node, { onSelect: () => onOpen(node.zone.name) }, reviewing, false)}
        </li>
      ))}
    </ul>
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
      variant="diagram"
      arrow
      onOpen={context.onSelect}
      style={{ height: node.height }}
      className="w-full overflow-hidden bg-surface"
    />
  );
}

/** Ce que le fil et « Aller à… » disent de ce qu'ils comptent : les Données par défaut, l'Architecture la remplace (TK-112). */
export interface ZoneNouns {
  count: (count: number) => string;
  links: (count: number) => string;
  jumpLabel: string;
  jumpPlaceholder: string;
  nothingFound: { title: (text: string) => string; description: string };
}
export const DATA_NOUNS: ZoneNouns = {
  count: tablesLabel,
  links: linksLabel,
  jumpLabel: "Aller à une table",
  jumpPlaceholder: "Aller à une table…",
  nothingFound: {
    title: (text) => `Aucune table ne correspond à « ${text} »`,
    description: "Essayez un autre nom de table ou de champ.",
  },
};

/** Fil du diagramme (maquette 11 l.170) : « Toutes les zones · N tables » / zone ouverte · compte · liens sortants. */
function ZoneCrumbs({
  total,
  zone,
  count,
  crossLinks,
  onAll,
  nouns,
}: {
  total: number;
  zone: string | null;
  count: number;
  crossLinks: number;
  onAll: () => void;
  nouns: ZoneNouns;
}) {
  const all = `Toutes les zones · ${nouns.count(total)}`;
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
            {`· ${nouns.count(count)}${crossLinks > 0 ? ` · ${nouns.links(crossLinks)}` : ""}`}
          </span>
        </>
      )}
    </nav>
  );
}

/** Résultat de la recherche d'une table (`spec.data.search` ou `clientSpace.dataSearch`). */
export interface JumpItem {
  id: string;
  name: string;
  zone?: string | undefined;
}
export interface JumpResult {
  /** Texte réellement interrogé (après l'anti-rebond). */
  q: string;
  items: readonly JumpItem[];
}
/** « Aller à une table… » : recherche serveur sur toute la tête, `/` y amène le focus, Entrée ouvre. */
function TableJump({
  value,
  items,
  listId,
  nouns,
  onChange,
  onSubmit,
}: {
  value: string;
  items: readonly JumpItem[];
  listId: string;
  nouns: ZoneNouns;
  onChange: (value: string, chosen: boolean) => void;
  onSubmit: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
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
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={submit} className="relative w-[260px] max-sm:w-full">
      <SearchField
        ref={ref}
        label={nouns.jumpLabel}
        fieldSize="xs"
        placeholder={nouns.jumpPlaceholder}
        list={listId}
        value={value}
        autoComplete="off"
        className="[&_input]:pr-8"
        onChange={(event) => {
          // Une suggestion choisie dans la liste (pas une frappe) remplit le champ d'un nom exact : on y va tout de suite.
          const typed = (event.nativeEvent as InputEvent).inputType;
          onChange(
            event.currentTarget.value,
            typed === undefined || typed === "insertReplacementText",
          );
        }}
      />
      <Kbd
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2"
      >
        /
      </Kbd>
      <datalist id={listId}>
        {items.map((item) => (
          <option key={item.id} value={item.name}>
            {item.id}
          </option>
        ))}
      </datalist>
    </form>
  );
}

/** Barre au-dessus du diagramme par zones : fil et « Aller à une table… » (recherche serveur, 200 ms de calme). */
export function ZoneBar(props: {
  total: number;
  zone: string | null;
  count: number;
  crossLinks: number;
  /** Texte saisi (état du parent, qui interroge le serveur) et résultats du texte interrogé. */
  value: string;
  onValueChange: (value: string) => void;
  result: JumpResult;
  onAll: () => void;
  onPick: (item: JumpItem) => void;
  /** Mots du fil et de la recherche ; ceux des Données par défaut. */
  nouns?: ZoneNouns;
  /** Fil « Toutes les zones » : masqué quand le schéma n'a pas de zones (maquette 13 l.178). */
  crumbs?: boolean;
}) {
  const { value, onValueChange, result, onPick, nouns = DATA_NOUNS, crumbs = true } = props;
  const listId = useId();
  const text = value.trim();
  // Les résultats d'une saisie plus ancienne ne comptent pas : on attend ceux du texte affiché.
  const fresh = result.q === text ? result.items : [];
  const pick = (wanted: string) => {
    const key = wanted.trim().toLocaleLowerCase("fr");
    const item =
      fresh.find(
        (entry) => entry.name.toLocaleLowerCase("fr") === key || entry.id.toLowerCase() === key,
      ) ?? fresh[0];
    if (!item) return false;
    onPick(item);
    onValueChange("");
    return true;
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-meta">
        {crumbs ? (
          <ZoneCrumbs
            total={props.total}
            zone={props.zone}
            count={props.count}
            crossLinks={props.crossLinks}
            onAll={props.onAll}
            nouns={nouns}
          />
        ) : null}
        <span className="flex-1" />
        <TableJump
          value={value}
          items={fresh}
          listId={listId}
          nouns={nouns}
          onChange={(next, chosen) => {
            if (!(chosen && pick(next))) onValueChange(next);
          }}
          onSubmit={() => void pick(value)}
        />
      </div>
      {text !== "" && result.q === text && result.items.length === 0 ? (
        <EmptyState
          variant="inline"
          bordered
          icon="search_off"
          title={nouns.nothingFound.title(text)}
          description={nouns.nothingFound.description}
        />
      ) : null}
    </>
  );
}
