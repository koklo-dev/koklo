import {
  type DataEntry,
  SECURITY_LIMITS,
  type SecuritySummary,
  SUMMARY_SECTIONS,
  type SummaryKey,
} from "../entities/index.ts";
import { isPersonalData } from "./blockers.ts";
import { groupedBy } from "./group.ts";
import { oneLineOf, technicalTraceIn } from "./text.ts";

/**
 * Résumé client (TK-117, B796, B800). La carte « Combien de temps on garde » est composée par le code depuis les seules
 * durées saisies : ni durée par défaut, ni suggestion de l'agent (A7). Fonctions pures.
 */
export const RETENTION_UNDECIDED = "À décider";
const NAMES_PER_SENTENCE = 5;

/** Texte saisi repris au client : sur une ligne, remplacé s'il porte une trace technique. */
const plain = (text: string, fallback: string): string => {
  const line = oneLineOf(text, SECURITY_LIMITS.line).replace(/^[#\s]+/, "");
  return line === "" || technicalTraceIn(line) ? fallback : line;
};

function sentence(entries: readonly DataEntry[], value: string): string {
  const names = [...new Set(entries.map((entry) => plain(entry.donnee, "Une donnée")))];
  const others = names.length - NAMES_PER_SENTENCE;
  const shown = names.slice(0, NAMES_PER_SENTENCE).join(", ");
  return `${shown}${others > 0 ? ` et ${others} autres` : ""} : ${value.replace(/\.+$/, "")}.`;
}

/** Phrases tenant dans la place donnée, dans l'ordre. */
function fitting(sentences: readonly string[], room: number): string[] {
  let used = 0;
  return sentences.filter((text) => {
    used += text.length + 1;
    return used <= room;
  });
}

/** Durées saisies, regroupées ; les données sur une personne sans durée restent « à décider ». */
export function retentionText(entries: readonly DataEntry[]): string {
  const decided = entries.filter((entry) => entry.conservation !== undefined);
  if (decided.length === 0) return RETENTION_UNDECIDED;
  const groups = groupedBy(decided, (entry) => entry.conservation as string);
  const sentences = [...groups].map(([duration, group]) =>
    sentence(group, plain(duration, "à préciser")),
  );
  const pending = entries.filter(
    (entry) => entry.conservation === undefined && isPersonalData(entry.categorie),
  );
  const last = pending.length === 0 ? [] : [sentence(pending, "à décider")];
  const room = SECURITY_LIMITS.text - (last[0]?.length ?? 0);
  return [...fitting(sentences, room), ...last].join(" ");
}

export interface SummaryCard {
  readonly key: SummaryKey;
  readonly title: string;
  readonly text: string;
}

/** Les sept cartes, dans l'ordre : le texte du fichier, sauf la conservation, recomposée à la lecture. */
export const summaryCards = (
  summary: SecuritySummary,
  entries: readonly DataEntry[],
): SummaryCard[] =>
  SUMMARY_SECTIONS.map(({ key, title }) => ({
    key,
    title,
    text: key === "conservation" ? retentionText(entries) : summary[key],
  }));
