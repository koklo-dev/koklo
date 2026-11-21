import { type Adr, EmitAdrError, emitAdrMarkdown, parseAdrMarkdown } from "@koklo/schema";
import { slugOf } from "./paths.ts";
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

/** Champs d'une opération `adr.create|update` (contrat 3.9.0), tous facultatifs ici. */
interface AdrPayload {
  title?: string;
  context?: string;
  decision?: string;
  positives?: string[];
  accepted?: string[];
  alternatives?: { name: string; reason: string }[];
  plain?: string;
  links?: string[];
  status?: Adr["statut"];
  supersededBy?: string;
}

const ADR_FILE = /^architecture\/adr\/(ADR-\d{3,})-[^/]*\.md$/;

/** Décisions de la tête : identifiant -> chemin. */
export function adrIndex(paths: Iterable<string>): Map<string, string> {
  const index = new Map<string, string>();
  for (const path of paths) {
    const id = ADR_FILE.exec(path)?.[1];
    if (id !== undefined) index.set(id, path);
  }
  return index;
}

/** Chemin d'une décision nouvelle : `architecture/adr/<ADR-nnn>-<slug du titre>.md`. */
export const adrPathOf = (id: string, title: unknown): string =>
  `architecture/adr/${id}-${slugOf(title, "decision")}.md`;

function overlay(base: Adr, payload: AdrPayload): Adr {
  const next: Adr = { ...base, consequences: { ...base.consequences } };
  if (payload.title !== undefined) next.titre = payload.title;
  if (payload.context !== undefined) next.contexte = payload.context;
  if (payload.decision !== undefined) next.decision = payload.decision;
  if (payload.positives !== undefined) next.consequences.positives = payload.positives;
  if (payload.accepted !== undefined) next.consequences.a_accepter = payload.accepted;
  if (payload.alternatives !== undefined) {
    next.alternatives = payload.alternatives.map((a) => ({ nom: a.name, raison: a.reason }));
  }
  if (payload.plain !== undefined) next.en_clair = payload.plain;
  if (payload.links !== undefined) next.liens = payload.links;
  if (payload.status !== undefined) next.statut = payload.status;
  if (payload.supersededBy !== undefined) next.remplacee_par = payload.supersededBy;
  return next;
}

function write(workspace: Workspace, path: string, adr: Adr): void {
  try {
    writeFile(workspace, path, emitAdrMarkdown(adr));
  } catch (error) {
    if (!(error instanceof EmitAdrError)) throw error;
    invalidEmit(path, adr.id, error);
  }
}

function current(workspace: Workspace, path: string): Adr {
  const parsed = parseAdrMarkdown(path, workspace.files.get(path) ?? "");
  return parsed.ok ? parsed.value : stop(failed("SPEC_INVALID", toStoredReport(parsed.issues)));
}

/** `adr.create|update|delete` : une décision naît « proposée », datée du jour de l'enfilage du lot (`today`). */
export function applyAdr(
  workspace: Workspace,
  operation: BatchOperation,
  path: string | undefined,
  today: string,
): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as AdrPayload;
  if (operation.kind === "adr.create") {
    const empty: Adr = {
      id,
      titre: "",
      statut: "proposee",
      date: today,
      decideurs: [],
      liens: [],
      contexte: "",
      decision: "",
      consequences: { positives: [], a_accepter: [] },
      alternatives: [],
    };
    write(workspace, adrPathOf(id, payload.title), overlay(empty, payload));
  } else if (path !== undefined && operation.kind === "adr.delete") {
    removeFile(workspace, path);
  } else if (path !== undefined) {
    write(workspace, path, overlay(current(workspace, path), payload));
  }
}
