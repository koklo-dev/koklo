import type { ParsedSprint } from "./parsed-sprint.ts";
import { clip, type ReportLine } from "./report.ts";
import { markLines, reportLine, type Section, splitSections, toLines } from "./sprint-lines.ts";
import { type OtherSections, readOtherSections } from "./sprint-sections.ts";
import { TaskZoneParser } from "./task-zone-parser.ts";

const FILE_NAME = /^sprint-([0-9]{3})\.md$/;

function sprintNumberOf(fileName: string): number {
  const number = Number(FILE_NAME.exec(fileName)?.[1]);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`nom de fichier de sprint invalide : ${clip(fileName)}`);
  }
  return number;
}

/** Sprint sans tâche ou sans objectif : consigné (le premier est permis, le second est une erreur). */
function structureProblems(
  file: string,
  tasksSection: Section | undefined,
  tasks: TaskZoneParser,
  others: OtherSections,
): ReportLine[] {
  const found: ReportLine[] = [];
  if (tasks.heads === 0 && !tasks.hasWithoutTasksNotice) {
    const at = tasksSection?.heading ?? { n: 1, raw: "section ## ✅ Tasks absente" };
    found.push(reportLine(file, at, "sprint-without-tasks", "ignored"));
  }
  if (others.goal === "") {
    const at = {
      n: others.goalLine ?? 1,
      raw: "## 🎯 Sprint Goal absent ou vide (objectif obligatoire)",
    };
    found.push(reportLine(file, at, "unknown-line", "error"));
  }
  return found;
}

/**
 * Lit un fichier de sprint au format Shipyard. Fonction pure (aucune E/S) : tout ce qui n'est pas
 * importé est consigné avec fichier, ligne et raison dans `report`, rien n'est perdu en silence.
 */
export function parseSprintFile(fileName: string, text: string): ParsedSprint {
  const number = sprintNumberOf(fileName);
  const sections = splitSections(markLines(toLines(text)));
  const others = readOtherSections(fileName, sections);
  const tasks = new TaskZoneParser(fileName);
  const taskSections = sections.filter((section) => section.kind === "tasks");
  for (const section of taskSections) {
    for (const line of section.lines) tasks.feed(line);
  }
  tasks.finish();
  const report = [
    ...others.report,
    ...tasks.report,
    ...structureProblems(fileName, taskSections[0], tasks, others),
  ];
  return {
    fileName,
    number,
    key: `SP-${number}`,
    goal: others.goal,
    goalLine: others.goalLine ?? 1,
    definitionOfDone: others.dodItems.join("\n"),
    tickets: tasks.tickets,
    rejected: tasks.rejected,
    ticketHeads: tasks.heads,
    taskZone: tasks.zone,
    report: report.sort((a, b) => a.line - b.line),
  };
}
