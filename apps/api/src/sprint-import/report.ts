/**
 * Rapport de l'import des fichiers de sprint (CDC §7.7, annexe C incidents 21 et 23) : chaque ligne
 * non importée porte fichier, numéro, texte, code et gravité. Liste de codes FERMÉE : une ligne
 * sans code connu est une erreur (`unknown-line`), jamais un abandon silencieux.
 */
export const REASON_CODES = [
  "blank",
  "comment",
  "dependency-cycle",
  "dependency-target-missing",
  "deleted-ticket-conflict",
  "field-not-imported",
  "human-action",
  "missing-package",
  "missing-sensitivity",
  "section-not-imported",
  "sprint-conflict",
  "sprint-dod",
  "sprint-without-tasks",
  "status-conflict",
  "status-line-unparsable",
  "title-conflict",
  "unknown-line",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
export type Severity = "ignored" | "warning" | "error";

export interface ReportLine {
  file: string;
  line: number;
  text: string;
  code: ReasonCode;
  severity: Severity;
  key?: string;
}

export interface ImportReport {
  dryRun: boolean;
  /** Aucune ligne de gravité `error` (conflits inclus) ; les avertissements sont permis. */
  ok: boolean;
  files: number;
  sprints: { created: number; matched: number; conflicts: number };
  tickets: { created: number; matched: number; conflicts: number; rejected: number };
  dependencies: { created: number; present: number; rejected: number };
  lines: ReportLine[];
  totalsByCode: Partial<Record<ReasonCode, number>>;
}

const TEXT_LIMIT = 200;

/** Texte d'une ligne de rapport : borné, jamais interprété. */
export const clip = (text: string): string => {
  const trimmed = text.trim();
  return trimmed.length > TEXT_LIMIT ? `${trimmed.slice(0, TEXT_LIMIT)}…` : trimmed;
};

export function totalsOf(lines: readonly ReportLine[]): Partial<Record<ReasonCode, number>> {
  const totals: Partial<Record<ReasonCode, number>> = {};
  for (const { code } of lines) {
    totals[code] = (totals[code] ?? 0) + 1;
  }
  return totals;
}
