import {
  ASVS_CHAPTERS,
  type AsvsChapter,
  type AsvsFile,
  type AsvsLevel,
  type AsvsRequirement,
  type DataEntry,
} from "../entities/index.ts";
import { isPersonalData } from "./blockers.ts";

/** Niveau ASVS (A6, B797) et couverture par chapitre (B798). Aucun catalogue embarqué ; fonctions pures. */
type Categorized = readonly Pick<DataEntry, "categorie">[];

/** Niveau recommandé : 2 dès qu'une donnée sur une personne est classée, sinon 1. */
export const recommendedAsvsLevel = (entries: Categorized): AsvsLevel =>
  entries.some((entry) => isPersonalData(entry.categorie)) ? 2 : 1;

/** Niveau appliqué : la saisie humaine l'emporte sur la recommandation. */
export const effectiveAsvsLevel = (
  file: Pick<AsvsFile, "niveau"> | undefined,
  entries: Categorized,
): AsvsLevel => file?.niveau ?? recommendedAsvsLevel(entries);

export interface ChapterCoverage {
  readonly chapitre: AsvsChapter;
  readonly answered: number;
  readonly total: number;
  /** Où c'est traité : les réponses du chapitre, sans doublon. */
  readonly where: readonly string[];
  /** `to_check` : aucune exigence listée, jamais « couvert ». */
  readonly state: "covered" | "missing" | "to_check";
}

export interface AsvsCoverage {
  readonly chapters: readonly ChapterCoverage[];
  readonly answered: number;
  readonly total: number;
}

function chapterCoverage(
  chapitre: AsvsChapter,
  requirements: readonly AsvsRequirement[],
): ChapterCoverage {
  const listed = requirements.filter((requirement) => requirement.chapitre === chapitre);
  const answers = listed.flatMap(({ reponse }) => (reponse === undefined ? [] : [reponse]));
  const covered = answers.length === listed.length ? "covered" : "missing";
  return {
    chapitre,
    answered: answers.length,
    total: listed.length,
    where: [...new Set(answers)],
    state: listed.length === 0 ? "to_check" : covered,
  };
}

/** Les neuf chapitres, sur les exigences de niveau inférieur ou égal au niveau effectif. */
export function asvsCoverage(
  requirements: readonly AsvsRequirement[],
  level: AsvsLevel,
): AsvsCoverage {
  const applicable = requirements.filter((requirement) => requirement.niveau <= level);
  const chapters = ASVS_CHAPTERS.map((chapter) => chapterCoverage(chapter, applicable));
  return {
    chapters,
    answered: chapters.reduce((sum, chapter) => sum + chapter.answered, 0),
    total: applicable.length,
  };
}
