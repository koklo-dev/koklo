import {
  AI_ANSWER_MAX_LENGTH,
  AI_ANSWERS_MAX,
  AI_BRIEF_INPUT_MAX_LENGTH,
  AI_IDEA_MAX_LENGTH,
} from "@koklo/contract";
import { thousands } from "./framing-labels.ts";
import type { BriefFields, FramingDraft } from "./framing-types.ts";

/** Saisie, brief et validation de l'écran de cadrage : fonctions pures (S-framing §3.3, §3.4). */
export const IDEA_MAX = AI_IDEA_MAX_LENGTH;
export const BRIEF_MAX = AI_BRIEF_INPUT_MAX_LENGTH;
export const COUNTER_ANNOUNCE_FROM = 7500;

export const EMPTY_BRIEF: BriefFields = {
  title: "",
  problem: "",
  users: "",
  expectedOutcome: "",
  constraints: "",
  openQuestions: "",
};

export const emptyDraft = (): FramingDraft => ({
  mode: "idea",
  idea: "",
  clarifications: "",
  pastedBrief: "",
  brief: null,
  answers: [],
  proposals: [],
  savedAt: new Date().toISOString(),
});

export const BRIEF_FIELDS: ReadonlyArray<{
  key: keyof BriefFields;
  label: string;
  rows: number;
}> = [
  { key: "title", label: "Titre", rows: 1 },
  { key: "problem", label: "Problème", rows: 3 },
  { key: "users", label: "Utilisateurs", rows: 2 },
  { key: "expectedOutcome", label: "Résultat attendu", rows: 2 },
  { key: "constraints", label: "Contraintes", rows: 2 },
  { key: "openQuestions", label: "Questions ouvertes", rows: 3 },
];

/** Lignes non vides, espaces autour retirés. */
export const linesOf = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

export const briefFromAi = (
  brief: Omit<BriefFields, "openQuestions"> & { openQuestions: string[] },
) => ({
  ...brief,
  openQuestions: brief.openQuestions.join("\n"),
});

/** Brief envoyé à `ai.proposeFeatures` : les champs renseignés, libellé et valeur, en un seul texte. */
function briefToText(brief: BriefFields): string {
  return BRIEF_FIELDS.map(({ key, label }) => {
    const value = brief[key].trim();
    return value ? `${label} : ${value}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

/** Texte du brief à envoyer selon le chemin choisi. */
export const briefText = (state: Pick<FramingDraft, "mode" | "pastedBrief" | "brief">): string => {
  if (state.mode === "brief") return state.pastedBrief.trim();
  return state.brief ? briefToText(state.brief) : "";
};

interface IdeaIssues {
  idea?: string;
  clarifications?: string;
}

export function validateIdea(idea: string, clarifications: string): IdeaIssues {
  const issues: IdeaIssues = {};
  if (idea.length > IDEA_MAX) {
    issues.idea = `L'idée ne doit pas dépasser ${thousands(IDEA_MAX)} caractères.`;
  }
  const lines = linesOf(clarifications);
  if (lines.length > AI_ANSWERS_MAX) {
    issues.clarifications = `Une précision par ligne, ${AI_ANSWERS_MAX} au plus.`;
  } else if (lines.some((line) => line.length > AI_ANSWER_MAX_LENGTH)) {
    issues.clarifications = `Chaque précision est limitée à ${thousands(AI_ANSWER_MAX_LENGTH)} caractères.`;
  }
  return issues;
}

/** Message d'erreur d'un brief hors bornes (1 à 20 000 caractères), ou `undefined`. */
export function validateBriefText(text: string): string | undefined {
  return text.length > BRIEF_MAX
    ? `Le brief ne doit pas dépasser ${thousands(BRIEF_MAX)} caractères.`
    : undefined;
}

/** Réponses envoyées à la régénération : une par ligne non vide, dans l'ordre des questions. */
export const answersOf = (answers: string[]): string[] =>
  answers.map((answer) => answer.trim()).filter(Boolean);

export const isEmptyDraft = (state: FramingDraft): boolean =>
  state.idea === "" &&
  state.clarifications === "" &&
  state.pastedBrief === "" &&
  state.brief === null &&
  state.proposals.length === 0;
