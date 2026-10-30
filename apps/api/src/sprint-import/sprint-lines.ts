import type { SourceLine } from "./parsed-sprint.ts";
import type { ReasonCode, ReportLine } from "./report.ts";
import { clip } from "./report.ts";

export type LineMark = "comment" | "progress" | null;
export type MarkedLine = SourceLine & { mark: LineMark };

export type SectionKind =
  | "goal"
  | "tasks"
  | "period"
  | "human"
  | "dod"
  | "risks"
  | "runs"
  | "other";

export interface Section {
  kind: SectionKind;
  heading: MarkedLine;
  lines: MarkedLine[];
}

const SECTION_KINDS: [RegExp, SectionKind][] = [
  [/\bSprint Goal\b/, "goal"],
  [/\bTasks\b/, "tasks"],
  [/\bPeriod\b/, "period"],
  [/Prérequis/, "human"],
  [/\bSprint DoD\b/, "dod"],
  [/\bRisks\b/, "risks"],
  [/\bWorkflow Runs\b/, "runs"],
];

/** Découpe le texte en lignes numérotées (base 1), sans fin de ligne. */
export function toLines(text: string): SourceLine[] {
  return text.split("\n").map((raw, index) => ({
    n: index + 1,
    raw: raw.endsWith("\r") ? raw.slice(0, -1) : raw,
  }));
}

/**
 * Marque les commentaires HTML (y compris sur plusieurs lignes) et le bloc `shipyard-progress`
 * (état machine de la boucle) : ces lignes ne portent aucune donnée de ticket.
 */
export function markLines(lines: readonly SourceLine[]): MarkedLine[] {
  let commentOpen = false;
  let progress = false;
  return lines.map((line) => {
    const trimmed = line.raw.trim();
    if (commentOpen) {
      commentOpen = !trimmed.includes("-->");
      return { ...line, mark: "comment" };
    }
    if (trimmed.startsWith("<!--")) {
      commentOpen = !trimmed.includes("-->");
      if (trimmed.includes("shipyard-progress:start")) progress = true;
      if (trimmed.includes("shipyard-progress:end")) progress = false;
      return { ...line, mark: "comment" };
    }
    return { ...line, mark: progress ? "progress" : null };
  });
}

const kindOf = (heading: string): SectionKind =>
  SECTION_KINDS.find(([pattern]) => pattern.test(heading))?.[1] ?? "other";

/** Sections `## ` du fichier ; les lignes avant la première (en-tête, titre) n'en font pas partie. */
export function splitSections(lines: readonly MarkedLine[]): Section[] {
  const sections: Section[] = [];
  for (const line of lines) {
    if (line.mark === null && line.raw.startsWith("## ")) {
      sections.push({ kind: kindOf(line.raw), heading: line, lines: [] });
    } else {
      sections.at(-1)?.lines.push(line);
    }
  }
  return sections;
}

export function reportLine(
  file: string,
  line: SourceLine,
  code: ReasonCode,
  severity: ReportLine["severity"],
  extra: { key?: string; text?: string } = {},
): ReportLine {
  const base = { file, line: line.n, text: clip(extra.text ?? line.raw), code, severity };
  return extra.key === undefined ? base : { ...base, key: extra.key };
}
