import type { ReportLine } from "./report.ts";
import { type MarkedLine, reportLine, type Section } from "./sprint-lines.ts";

export interface OtherSections {
  report: ReportLine[];
  goal: string;
  goalLine: number | null;
  dodItems: string[];
}

const DOD_ITEM = /^- (?:\[[ xX]\] )?(.*)$/;

const isBlank = (line: MarkedLine): boolean => line.raw.trim() === "";

/** Classe une ligne hors zone des tâches : chacune reçoit un code, aucune ne disparaît sans trace. */
function classify(file: string, section: Section, line: MarkedLine): ReportLine | null {
  if (isBlank(line)) return null;
  if (line.mark === "comment") return reportLine(file, line, "comment", "ignored");
  if (line.mark === "progress") return reportLine(file, line, "section-not-imported", "ignored");
  switch (section.kind) {
    case "goal":
      return null;
    case "human":
      return reportLine(file, line, "human-action", "ignored");
    case "dod":
      return reportLine(file, line, "sprint-dod", "ignored");
    default:
      return reportLine(file, line, "section-not-imported", "ignored");
  }
}

const dodText = (line: MarkedLine): string =>
  DOD_ITEM.exec(line.raw.trim())?.[1] ?? line.raw.trim();

function collect(result: OtherSections, section: Section, goals: string[]): void {
  for (const line of section.lines) {
    if (isBlank(line) || line.mark !== null) continue;
    if (section.kind === "goal") goals.push(line.raw.trim());
    if (section.kind === "dod") result.dodItems.push(dodText(line));
  }
}

/** Objectif, définition de fait et lignes ignorées des sections autres que `## ✅ Tasks`. */
export function readOtherSections(file: string, sections: readonly Section[]): OtherSections {
  const result: OtherSections = { report: [], goal: "", goalLine: null, dodItems: [] };
  const goals: string[] = [];
  for (const section of sections.filter((candidate) => candidate.kind !== "tasks")) {
    if (section.kind === "other") {
      result.report.push(reportLine(file, section.heading, "section-not-imported", "ignored"));
    }
    if (section.kind === "goal") result.goalLine ??= section.heading.n;
    for (const line of section.lines) {
      const entry = classify(file, section, line);
      if (entry) result.report.push(entry);
    }
    collect(result, section, goals);
  }
  result.goal = goals.join("\n");
  return result;
}
