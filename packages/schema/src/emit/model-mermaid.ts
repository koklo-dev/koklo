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

/**
 * Tables -> `data/model.mmd` (B384) : diagramme `erDiagram` déterministe (tables triées par identifiant, relations dans
 * l'ordre déclaré), une relation déclarée une seule fois, par la table qui porte la clé. Pure, sans I/O.
 */
export function emitModelMermaid(tables: readonly TableV2[]): string {
  const sorted = [...tables].sort(byId);
  const blocks = sorted.map((table) =>
    [`  ${entity(table.id)} {`, ...table.champs.map(attribute), "  }"].join("\n"),
  );
  const relations = sorted.flatMap((table) =>
    (table.relations ?? []).map(
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
