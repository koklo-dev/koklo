import type { Feature } from "@koklo/schema";

type Criterion = Feature["criteres"][number];
type Step = Criterion["etapes"][number];

/** Critère tel que soumis par le contrat (`criteria`, sans identifiant). */
export interface SubmittedCriterion {
  readonly title: string;
  readonly steps: readonly { readonly type: Step["type"]; readonly text: string }[];
}

const numberOf = (id: string): number => Number(id.slice(3));

/**
 * `criteria` remplacé en bloc : un critère garde son `AC-n` s'il existe déjà avec le même titre
 * (après `trim`, sensible à la casse, une correspondance par critère existant, dans l'ordre) ;
 * sinon il reçoit `max(existants ∪ attribués) + 1`. Un identifiant n'est jamais réattribué.
 */
export function numberCriteria(
  existing: readonly Criterion[],
  submitted: readonly SubmittedCriterion[],
): Criterion[] {
  const unused = [...existing];
  let highest = existing.reduce((max, criterion) => Math.max(max, numberOf(criterion.id)), 0);
  return submitted.map((criterion) => {
    const title = criterion.title.trim();
    const matchIndex = unused.findIndex((candidate) => candidate.titre === title);
    const match = matchIndex < 0 ? undefined : unused.splice(matchIndex, 1)[0];
    if (!match) highest += 1;
    return {
      id: match?.id ?? `AC-${highest}`,
      titre: title,
      etapes: criterion.steps.map((step) => ({ type: step.type, texte: step.text.trim() })),
    };
  });
}
