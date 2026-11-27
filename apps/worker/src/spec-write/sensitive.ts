import {
  type DataEntry,
  emitSecurityDataYaml,
  expandDataFields,
  type ModelTable,
  parseSpecFiles,
  SECURITY_PROPOSAL_VOCABULARY,
  type SecurityData,
} from "@koklo/schema";
import { overlaid, readEntity, wordOf, writeEntity } from "./technical-files.ts";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, type Workspace } from "./workspace.ts";

export const SECURITY_DATA_PATH = "security/data.yaml";

/** Champs d'une opération `sensitive.create|update` (contrat 3.19.0) ; texte vide : rubrique retirée. */
interface SensitivePayload {
  data?: string;
  fields?: string[];
  category?: keyof (typeof SECURITY_PROPOSAL_VOCABULARY)["dataCategory"];
  retention?: string;
  retentionSuggestion?: string;
  access?: string[];
  protection?: string;
}

/** `security/data.yaml` de la tête, vide quand il n'existe pas. */
export const readSecurityData = (workspace: Workspace): SecurityData =>
  workspace.files.has(SECURITY_DATA_PATH)
    ? readEntity(workspace, SECURITY_DATA_PATH, (spec) => spec.securityData)
    : { donnees: [] };

/** Le manifeste dit le format des tables (v1 ou v2). */
const isModelFile = (path: string): boolean =>
  path === "koklo.project.yaml" || path.startsWith("data/tables/");

/** Tables du modèle à l'état du lot : une table saisie seule est développée en ses champs du moment (B795). */
function tablesOf(workspace: Workspace): ModelTable[] {
  const files = [...workspace.files]
    .filter(([path]) => isModelFile(path))
    .map(([path, content]) => ({ path, content }));
  return parseSpecFiles(files).spec.tables.map(({ value }) => value);
}

/** Valeur après l'opération : absente, la valeur reste ; vide, la rubrique est retirée. */
const optional = (next: string | undefined, base: string | undefined) =>
  next === undefined ? base : next || undefined;

function entryAfter(
  base: DataEntry,
  payload: SensitivePayload,
  tables: readonly ModelTable[],
): DataEntry {
  const words = SECURITY_PROPOSAL_VOCABULARY.dataCategory;
  return {
    ...overlaid(base, {
      donnee: payload.data,
      champs: payload.fields && expandDataFields(payload.fields, tables),
      categorie: wordOf(words, payload.category),
      acces: payload.access,
    }),
    conservation: optional(payload.retention, base.conservation),
    conservation_proposee: optional(payload.retentionSuggestion, base.conservation_proposee),
    protection: optional(payload.protection, base.protection),
  };
}

const emptyEntry: DataEntry = { donnee: "", champs: [], categorie: "technique", acces: [] };

function entriesAfter(
  entries: readonly DataEntry[],
  operation: BatchOperation,
  tables: readonly ModelTable[],
): DataEntry[] {
  const payload = operation.payload as SensitivePayload;
  if (operation.kind === "sensitive.create") {
    return [...entries, entryAfter(emptyEntry, payload, tables)];
  }
  const id = operation.targetSpecId ?? "";
  if (operation.kind === "sensitive.delete") {
    return entries.filter((entry) => entry.champs[0] !== id);
  }
  return entries.map((entry) =>
    entry.champs[0] === id ? entryAfter(entry, payload, tables) : entry,
  );
}

/**
 * `sensitive.create|update|delete` sur `security/data.yaml` ; une entrée se désigne par son premier champ. Un champ déjà
 * classé ailleurs rend le fichier invalide (`SPEC_INVALID`). La conservation n'est que celle de l'opération (A7).
 */
export function applySensitive(workspace: Workspace, operation: BatchOperation): void {
  forbidDesigner(workspace);
  const file = readSecurityData(workspace);
  const next = { ...file, donnees: entriesAfter(file.donnees, operation, tablesOf(workspace)) };
  const id = operation.targetSpecId ?? "";
  writeEntity(workspace, SECURITY_DATA_PATH, id, () => emitSecurityDataYaml(next));
}
