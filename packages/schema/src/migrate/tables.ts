import { stringify } from "yaml";
import type { Feature, Relation, TableV1 } from "../entities/index.ts";
import { compare, structIssue } from "../issue.ts";
import type { Issue, Parsed } from "../types.ts";
import { deleteOf, type MigrationResult, writeOf } from "./types.ts";

const TYPES: Record<string, string> = {
  text: "texte(255)",
  integer: "entier",
  boolean: "booleen",
  timestamp: "horodatage",
};
const CARDINALITES: Record<Relation["cardinalite"], string> = {
  "1-1": "1 → 1",
  "1-n": "1 → n",
  "n-1": "n → 1",
  "n-n": "n ↔ n",
};

interface FieldV2 {
  nom: string;
  type: string;
  cle?: "primaire";
  contraintes?: string;
}
interface TableDraft {
  id: string;
  nom: string;
  description?: string;
  zone?: string;
  champs: FieldV2[];
  relations: { vers: string; cardinalite: string }[];
}

const slugOfTable = (id: string): string => id.slice(2);
const nameOf = (slug: string): string => {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function fieldOf(field: TableV1["champs"][number]): FieldV2 {
  const primary = field.nom === "id" && field.type === "uuid" && field.unique;
  const out: FieldV2 = { nom: field.nom, type: TYPES[field.type] ?? field.type };
  if (primary) return { ...out, cle: "primaire" };
  const constraints = [field.nullable ? "" : "Obligatoire", field.unique ? "unique" : ""];
  const joined = constraints.filter(Boolean).join(", ");
  return joined === "" ? out : { ...out, contraintes: joined };
}

/** Zone d'une table : celle de la première fonctionnalité (par identifiant) qui la cite et en porte une. */
function zoneOf(tableId: string, features: readonly Parsed<Feature>[]): string | undefined {
  const sorted = [...features].sort((a, b) => compare(a.value.id, b.value.id));
  return sorted.find((f) => f.value.zone !== undefined && f.value.tables.includes(tableId))?.value
    .zone;
}

const draftOf = (table: TableV1, features: readonly Parsed<Feature>[]): TableDraft => {
  const zone = zoneOf(table.id, features);
  return {
    id: table.id,
    nom: nameOf(slugOfTable(table.id)),
    ...(table.description === undefined ? {} : { description: table.description }),
    ...(zone === undefined ? {} : { zone }),
    champs: table.champs.map(fieldOf),
    relations: [],
  };
};

function unknown(path: string, message: string): Issue {
  return structIssue("STRUCT_MIGRATION_UNKNOWN_REFERENCE", path, message);
}

/** `data/relations.yaml` : chaque relation devient une relation de la table source, et son champ un `ref(T-cible)`. */
function applyRelations(
  drafts: Map<string, TableDraft>,
  relations: readonly Parsed<{ relations: Relation[] }>[],
  issues: Issue[],
): void {
  for (const file of relations) {
    for (const relation of file.value.relations) {
      const [fromTable = "", fromField = ""] = relation.from.split(".");
      const [toTable = ""] = relation.to.split(".");
      const draft = drafts.get(fromTable);
      const field = draft?.champs.find((candidate) => candidate.nom === fromField);
      if (draft === undefined || field === undefined || !drafts.has(toTable)) {
        issues.push(
          unknown(
            file.path,
            `Migration refusée : la relation ${relation.from} -> ${relation.to} cite une table ou un champ inconnu.`,
          ),
        );
        continue;
      }
      draft.relations.push({ vers: toTable, cardinalite: CARDINALITES[relation.cardinalite] });
      if (field.type === "uuid" && field.cle === undefined) field.type = `ref(${toTable})`;
    }
  }
}

/** Tables `T-<slug>.yaml` -> `<slug>.yaml` au format v2 ; `data/relations.yaml` est supprimé. */
export function planTables(
  tables: readonly Parsed<TableV1>[],
  relations: readonly Parsed<{ relations: Relation[] }>[],
  features: readonly Parsed<Feature>[],
): MigrationResult {
  const result: MigrationResult = { changes: [], issues: [] };
  const drafts = new Map(tables.map((t) => [t.value.id, draftOf(t.value, features)]));
  applyRelations(drafts, relations, result.issues);
  for (const { path, value } of tables) {
    const draft = drafts.get(value.id);
    if (draft === undefined) continue;
    const { relations: links, ...rest } = draft;
    const body = links.length === 0 ? rest : { ...rest, relations: links };
    result.changes.push(
      deleteOf(path),
      writeOf(`data/tables/${slugOfTable(value.id)}.yaml`, stringify(body, { lineWidth: 0 })),
    );
  }
  for (const file of relations) result.changes.push(deleteOf(file.path));
  return result;
}
