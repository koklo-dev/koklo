import type { Criterion } from "../entities/index.ts";
import { STEP_LABEL_BY_TYPE } from "../markdown-vocabulary.ts";

type StepType = Criterion["etapes"][number]["type"];

export type SectionResult<T> = { value: T; errors: { pointer: string; message: string }[] };

const STEP_TYPE_BY_LABEL = new Map(
  Object.entries(STEP_LABEL_BY_TYPE).map(([type, label]) => [label, type as StepType]),
);

const HEADING = /^###\s+(.*?)\s*$/;
const CRITERION_HEADING = /^(AC-\d+)\s+[—–-]\s+(.+)$/;
const STEP = /^[-*]\s+\*\*(.+?)\*\*\s+(.+?)\s*$/;

/** Corps d'une section `## <titre>` : lignes jusqu'au prochain `## `. */
export function sectionLines(lines: readonly string[], title: RegExp): string[] | undefined {
  const start = lines.findIndex((line) => /^##\s/.test(line) && title.test(line.slice(2).trim()));
  if (start < 0) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return end < 0 ? rest : rest.slice(0, end);
}

function parseStep(line: string, index: number, errors: SectionResult<unknown>["errors"]) {
  const match = STEP.exec(line);
  const type = match?.[1] === undefined ? undefined : STEP_TYPE_BY_LABEL.get(match[1]);
  if (!match || type === undefined) {
    errors.push({
      pointer: `/criteres/${index}/etapes`,
      message: `Ligne d'étape non reconnue dans le critère n°${index + 1} : « ${line.trim()} ».`,
    });
    return undefined;
  }
  return { type, texte: match[2] ?? "" };
}

type Errors = SectionResult<unknown>["errors"];

/** Ouvre un critère depuis un titre `### ...` ; signale un titre sans AC-n ou un doublon. */
function openCriterion(title: string, criteria: Criterion[], seen: Set<string>, errors: Errors) {
  const match = CRITERION_HEADING.exec(title);
  const id = match?.[1] ?? "";
  const pointer = `/criteres/${criteria.length}`;
  if (id === "") {
    errors.push({ pointer, message: `Titre de critère sans identifiant AC-n : « ${title} ».` });
  } else if (seen.has(id)) {
    errors.push({ pointer, message: `Identifiant de critère dupliqué : ${id}.` });
  }
  seen.add(id);
  criteria.push({ id, titre: match?.[2] ?? "", etapes: [] });
}

/** Critères `### AC-n — titre` suivis de puces d'étapes. */
export function parseCriteria(lines: readonly string[]): SectionResult<Criterion[]> {
  const errors: Errors = [];
  const criteria: Criterion[] = [];
  const seen = new Set<string>();
  for (const line of lines.filter((l) => l.trim() !== "")) {
    const heading = HEADING.exec(line);
    if (heading) {
      openCriterion(heading[1] ?? "", criteria, seen, errors);
      continue;
    }
    const current = criteria[criteria.length - 1];
    const step = current ? parseStep(line, criteria.length - 1, errors) : undefined;
    if (!current) {
      errors.push({
        pointer: "/criteres",
        message: `Texte avant le premier critère : « ${line.trim()} ».`,
      });
    } else if (step) current.etapes.push(step);
  }
  return { value: criteria, errors };
}
