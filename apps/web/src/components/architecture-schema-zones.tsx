"use client";

import { iconNameOr, ZoneNode as ZoneCard } from "@koklo/ui";
import {
  type ArchZoneNode,
  actorsLabel,
  componentsLabel,
  linksLabel,
  ZONE_HEIGHT,
  ZONE_PREVIEW,
} from "../lib/architecture-diagram.ts";
import { DATA_NOUNS, type ZoneNouns } from "./data-diagram-zones.tsx";

/** Mots du fil et de « Aller à un composant… » (maquette 13 l.178) : ceux des Données, accordés au schéma. */
export const ARCHITECTURE_NOUNS: ZoneNouns = {
  ...DATA_NOUNS,
  count: componentsLabel,
  links: (count) => `${linksLabel(count)} vers d'autres zones`,
  jumpLabel: "Aller à un composant",
  jumpPlaceholder: "Aller à un composant…",
  nothingFound: {
    title: (text) => `Aucun composant ne correspond à « ${text} »`,
    description: "Essayez un autre nom de composant ou son identifiant C-….",
  },
};

/** Carte d'une zone (maquette 13 l.702-710) : cadre pointillé, compte, acteurs, aperçu de 5 noms ; un clic l'ouvre. */
export function renderArchZone(
  node: ArchZoneNode,
  context: { onSelect: () => void },
  sized = true,
) {
  const { zone } = node;
  const actors = zone.actorCount > 0 ? `${actorsLabel(zone.actorCount)} · ` : "";
  return (
    <ZoneCard
      name={zone.name}
      icon={iconNameOr(zone.icon, "folder_open")}
      count={zone.componentCount}
      countLabel={zone.componentCount > 1 ? "composants" : "composant"}
      detail={`${actors}cliquez pour ouvrir`}
      preview={zone.preview}
      previewLimit={ZONE_PREVIEW}
      variant="architecture"
      arrow
      onOpen={context.onSelect}
      style={sized ? { height: node.height } : { minHeight: ZONE_HEIGHT }}
      className="w-full overflow-hidden"
    />
  );
}

/** 375 px : les cartes de zone en une colonne, sans lecteur ; le lecteur est masqué sous `md`. */
export function ArchZoneCardList({
  nodes,
  onOpen,
}: {
  nodes: readonly ArchZoneNode[];
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
        <li key={node.id}>
          {renderArchZone(node, { onSelect: () => onOpen(node.zone.name) }, false)}
        </li>
      ))}
    </ul>
  );
}
