import type { TableV2 } from "../entities/index.ts";

type Field = TableV2["champs"][number];

const GLYPH: Record<string, string> = {
  "1 → n": "||--o{",
  "n → 1": "}o--||",
  "1 → 1": "||--||",
  "1 → 0..1": "||--o|",
  "n ↔ n": "}o--o{",
};

const MERMAID_TYPE: Record<string, string> = {
  uuid: "uuid",
  entier: "int",
  decimal: "decimal",
  booleen: "bool",
  horodatage: "timestamp",
  date: "date",
  enum: "enum",
  json: "json",
};

const mermaidType = (type: string): string => {
  if (type.startsWith("texte(")) return "string";
  if (type.startsWith("ref(")) return "uuid";
  return MERMAID_TYPE[type] ?? "string";
};

/** Nom d'entité Mermaid : l'identifiant de la table, le tiret remplacé (non admis hors guillemets). */
const entity = (id: string): string => id.replaceAll("-", "_");

function attribute(field: Field): string {
  const keys = [
    ...(field.cle === "primaire" ? ["PK"] : []),
    ...(field.type.startsWith("ref(") ? ["FK"] : []),
  ];
  return `    ${mermaidType(field.type)} ${field.nom}${keys.length > 0 ? ` ${keys.join(", ")}` : ""}`;
}

const byId = (a: TableV2, b: TableV2): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const REF = /^ref\((T-[a-z0-9-]+)\)$/;

/**
 * Relations de la table : celles déclarées, puis une `n → 1` par clé étrangère `ref(T-…)` vers une table que la
 * table ne relie pas déjà (B476) : un modèle dont les relations ne sont portées que par ses clés se dessine relié.
 */
function relationsOf(table: TableV2): { vers: string; cardinalite: string }[] {
  const declared = (table.relations ?? []).map(({ vers, cardinalite }) => ({ vers, cardinalite }));
  const linked = new Set(declared.map((r) => r.vers));
  const implied: { vers: string; cardinalite: string }[] = [];
  for (const field of table.champs) {
    const target = REF.exec(field.type)?.[1];
    if (target === undefined || target === table.id || linked.has(target)) continue;
    linked.add(target);
    implied.push({ vers: target, cardinalite: "n → 1" });
  }
  return [...declared, ...implied];
}

/**
 * Tables -> `data/model.mmd` (B384) : diagramme `erDiagram` déterministe (tables triées par identifiant, relations dans
 * l'ordre déclaré puis celles des clés étrangères), une relation déclarée une seule fois, par la table qui porte la clé. Pure, sans I/O.
 */
export function emitModelMermaid(tables: readonly TableV2[]): string {
  const sorted = [...tables].sort(byId);
  const blocks = sorted.map((table) =>
    [`  ${entity(table.id)} {`, ...table.champs.map(attribute), "  }"].join("\n"),
  );
  const relations = sorted.flatMap((table) =>
    relationsOf(table).map(
      (r) =>
        `  ${entity(table.id)} ${GLYPH[r.cardinalite] ?? "||--||"} ${entity(r.vers)} : "${r.cardinalite}"`,
    ),
  );
  const lines = [
    "%% Généré par koklo depuis data/tables : ne pas modifier à la main.",
    "erDiagram",
    ...blocks,
    ...relations,
  ];
  return `${lines.join("\n")}\n`;
}
