import type { ErFieldKind, ErTableField, ErTableState } from "@koklo/ui";

/** Une table lue du `data/model.mmd` : identifiant `T-<slug>` et champs, sans le nom ni les données personnelles. */
export interface DiagramTable {
  id: string;
  fields: ErTableField[];
}

/** Types Mermaid de `emitModelMermaid` vers le vocabulaire de la spec (`string` n'a plus sa longueur : « texte »). */
const SPEC_TYPE: Record<string, string> = {
  uuid: "uuid",
  string: "texte",
  int: "entier",
  decimal: "decimal",
  bool: "booleen",
  timestamp: "horodatage",
  date: "date",
  enum: "enum",
  json: "json",
};

const ENTITY = /^\s*(T_[a-z0-9_]+)\s*\{\s*$/;
const ATTRIBUTE = /^\s+(\w+)\s+([a-z_][a-z0-9_]*)(?:\s+(.+))?$/;

function kindOf(keys: string | undefined): ErFieldKind {
  if (keys?.includes("PK")) return "primary";
  return keys?.includes("FK") ? "reference" : "plain";
}

/** Lit les blocs d'entité du diagramme `erDiagram` ; les relations et les commentaires sont ignorés. */
export function parseModelMermaid(text: string): DiagramTable[] {
  const tables: DiagramTable[] = [];
  let current: DiagramTable | null = null;
  for (const line of text.split("\n")) {
    const entity = ENTITY.exec(line);
    if (entity?.[1]) {
      current = { id: tableIdOf(entity[1]), fields: [] };
      tables.push(current);
    } else if (line.trim() === "}") current = null;
    else if (current) {
      const attribute = ATTRIBUTE.exec(line);
      if (attribute?.[1] && attribute[2]) {
        current.fields.push({
          name: attribute[2],
          type: SPEC_TYPE[attribute[1]] ?? attribute[1],
          kind: kindOf(attribute[3]),
        });
      }
    }
  }
  return tables;
}

/** Relation lue du `data/model.mmd` : `T_a }o--|| T_b : "n → 1"` va de `T-a` (qui la déclare) vers `T-b`. */
export interface DiagramLink {
  id: string;
  from: string;
  to: string;
  cardinality: string;
}

const RELATION = /^\s*(T_[a-z0-9_]+)\s+\S+\s+(T_[a-z0-9_]+)\s*:\s*"([^"]+)"\s*$/;
const tableIdOf = (entity: string): string => entity.replaceAll("_", "-");

/** Lit les relations du diagramme `erDiagram` (une par ligne), dans l'ordre du fichier. */
export function parseModelRelations(text: string): DiagramLink[] {
  const links: DiagramLink[] = [];
  for (const line of text.split("\n")) {
    const match = RELATION.exec(line);
    if (match?.[1] && match[2] && match[3]) {
      links.push({
        id: `r${links.length}`,
        from: tableIdOf(match[1]),
        to: tableIdOf(match[2]),
        cardinality: match[3],
      });
    }
  }
  return links;
}

/** Carte du diagramme : une table enregistrée, ou une proposition de l'agent avec son état de relecture. */
export interface DiagramCard {
  id: string;
  name: string;
  fields: ErTableField[];
  state?: ErTableState | undefined;
  /** Description d'une table proposée (la fiche d'une table enregistrée la lit dans le dépôt). */
  description?: string | undefined;
  /** Relations déclarées par une table proposée (une table enregistrée tire les siennes du Mermaid). */
  relations?: ReadonlyArray<{ to: string; cardinality: string }> | undefined;
}

/** « reservation » pour `T-reservation` quand la liste des tables ne donne pas le nom. */
const nameFromId = (id: string): string => id.replace(/^T-/, "").replaceAll("-", " ");

/**
 * Cartes du diagramme : les tables du modèle enregistré (noms d'après la liste), puis les tables proposées qui n'y
 * sont pas encore. Une table proposée en doublon d'une table enregistrée est celle du modèle (le tri l'écarte).
 */
export function diagramOf(
  saved: readonly DiagramTable[],
  names: ReadonlyMap<string, string>,
  proposed: readonly DiagramCard[],
): DiagramCard[] {
  const known = new Set(saved.map((table) => table.id));
  return [
    ...saved.map((table) => ({
      id: table.id,
      name: names.get(table.id) ?? nameFromId(table.id),
      fields: table.fields,
    })),
    ...proposed.filter((card) => !known.has(card.id)),
  ];
}
