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
      current = { id: entity[1].replaceAll("_", "-"), fields: [] };
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

/** Carte du diagramme : une table enregistrée, ou une proposition de l'agent avec son état de relecture. */
export interface DiagramCard {
  id: string;
  name: string;
  fields: ErTableField[];
  state?: ErTableState | undefined;
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
