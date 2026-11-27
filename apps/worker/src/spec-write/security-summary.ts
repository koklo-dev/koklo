import {
  type DataEntry,
  emitSummaryMarkdown,
  RETENTION_UNDECIDED,
  retentionText,
  SECURITY_PROPOSAL_VOCABULARY,
  type SecuritySummary,
} from "@koklo/schema";
import { readSecurityData } from "./sensitive.ts";
import { readEntity, writeEntity } from "./technical-files.ts";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, type Workspace } from "./workspace.ts";

export const SUMMARY_PATH = "security/summary.md";
const UNKNOWN = "À préciser";

const emptySummary: SecuritySummary = {
  donnees: UNKNOWN,
  protection: UNKNOWN,
  acces: UNKNOWN,
  connexion: UNKNOWN,
  conservation: RETENTION_UNDECIDED,
  verification: UNKNOWN,
  incident: UNKNOWN,
};

export const readSummary = (workspace: Workspace): SecuritySummary =>
  workspace.files.has(SUMMARY_PATH)
    ? readEntity(workspace, SUMMARY_PATH, (spec) => spec.securitySummaries)
    : emptySummary;

/** Résumé écrit avec la carte de conservation recomposée depuis les seules durées saisies (A7, B796). */
export function writeSummary(
  workspace: Workspace,
  summary: SecuritySummary,
  entries: readonly DataEntry[],
): void {
  const next = { ...summary, conservation: retentionText(entries) };
  writeEntity(workspace, SUMMARY_PATH, "summary", () => emitSummaryMarkdown(next));
}

/** `summary.update` : les cartes fournies remplacent les leurs, traduites vers les clés du fichier. */
export function applySummary(workspace: Workspace, operation: BatchOperation): void {
  forbidDesigner(workspace);
  const payload = operation.payload as Record<string, string | undefined>;
  const cards = Object.entries(SECURITY_PROPOSAL_VOCABULARY.section).flatMap(([key, section]) => {
    const text = payload[key];
    return text === undefined ? [] : [[section, text] as const];
  });
  const next = { ...readSummary(workspace), ...Object.fromEntries(cards) };
  writeSummary(workspace, next, readSecurityData(workspace).donnees);
}
