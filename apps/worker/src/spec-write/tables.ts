import {
  type CARDINALITES_V2,
  EmitTableError,
  emitTableYaml,
  parseTableFile,
  type TableV2,
} from "@koklo/schema";
import { toStoredReport } from "./report.ts";
import { type BatchOperation, failed } from "./types.ts";
import {
  forbidDesigner,
  invalidEmit,
  removeFile,
  stop,
  type Workspace,
  writeFile,
} from "./workspace.ts";

interface PayloadField {
  name: string;
  type: string;
  primaryKey?: boolean;
  constraints?: string;
  values?: string[];
  rule?: string;
  personalData?: boolean;
}

/** Champs d'une opération `table.create|update` (contrat 3.5.0), tous facultatifs ici. */
interface TablePayload {
  name?: string;
  zone?: string;
  description?: string;
  fields?: PayloadField[];
  sources?: string[];
  relations?: { to: string; cardinality: (typeof CARDINALITES_V2)[number] }[];
}

const TABLE_FILE = /^data\/tables\/(?:T-)?([a-z0-9][a-z0-9-]*)\.yaml$/;

/** Chemin d'une table nouvelle : `data/tables/<slug>.yaml` (le slug est l'identifiant sans `T-`). */
export const tablePathOf = (id: string): string => `data/tables/${id.slice(2)}.yaml`;

/** Tables de la tête : identifiant -> chemin (un fichier v1 `T-<slug>.yaml` occupe aussi son identifiant). */
export function tableIndex(paths: Iterable<string>): Map<string, string> {
  const index = new Map<string, string>();
  for (const path of paths) {
    const slug = TABLE_FILE.exec(path)?.[1];
    if (slug !== undefined) index.set(`T-${slug}`, path);
  }
  return index;
}

const field = (value: PayloadField): TableV2["champs"][number] => ({
  nom: value.name,
  type: value.type,
  ...(value.primaryKey === true ? { cle: "primaire" as const } : {}),
  ...(value.constraints === undefined ? {} : { contraintes: value.constraints }),
  ...(value.values === undefined ? {} : { valeurs: value.values }),
  ...(value.rule === undefined ? {} : { regle: value.rule }),
  ...(value.personalData === true ? { donnees_personnelles: true } : {}),
});

/** Applique les champs présents du payload (`undefined` : inchangé) ; une description vide est retirée. */
function overlay(base: TableV2, payload: TablePayload): TableV2 {
  const { description, ...rest } = base;
  const next: TableV2 = { ...rest };
  const text = payload.description === undefined ? description : payload.description;
  if (text !== undefined && text !== "") next.description = text;
  if (payload.name !== undefined) next.nom = payload.name;
  if (payload.zone !== undefined) next.zone = payload.zone;
  if (payload.fields !== undefined) next.champs = payload.fields.map(field);
  if (payload.sources !== undefined) next.source = payload.sources;
  if (payload.relations !== undefined) {
    next.relations = payload.relations.map((r) => ({ vers: r.to, cardinalite: r.cardinality }));
  }
  return next;
}

function write(workspace: Workspace, path: string, table: TableV2): void {
  try {
    writeFile(workspace, path, emitTableYaml(table));
  } catch (error) {
    if (!(error instanceof EmitTableError)) throw error;
    invalidEmit(path, table.id, error);
  }
}

function current(workspace: Workspace, path: string): TableV2 {
  const parsed = parseTableFile(path, workspace.files.get(path) ?? "");
  return parsed.ok ? parsed.value : stop(failed("SPEC_INVALID", toStoredReport(parsed.issues)));
}

/** `table.create|update|delete` : `path` est le fichier de la table sur la tête (vide à la création). */
export function applyTable(
  workspace: Workspace,
  operation: BatchOperation,
  path: string | undefined,
): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as TablePayload;
  if (operation.kind === "table.create") {
    write(workspace, tablePathOf(id), overlay({ id, nom: "", champs: [] }, payload));
  } else if (path !== undefined && operation.kind === "table.delete") {
    removeFile(workspace, path);
  } else if (path !== undefined) {
    write(workspace, path, overlay(current(workspace, path), payload));
  }
}
