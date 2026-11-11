import type { FormIssue } from "./feature-form.ts";
import type { ProposedFeature } from "./framing-types.ts";
import type { EditValues } from "./framing-validation.ts";
import { fromEditValues, toEditValues, validateEdit } from "./framing-validation.ts";
import type { ProposalOutput } from "./proposal-types.ts";

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Valeurs de l'éditeur : la proposition `criteria` n'édite que ses critères (le titre vient de la fonctionnalité visée). */
export function editValuesOf(proposal: ProposalOutput): EditValues {
  const { content } = proposal;
  const feature = {
    kind: "feature.create",
    title: proposal.kind === "feature" ? str(content.title) : proposal.title,
    priority: (str(content.priority) || "should") as ProposedFeature["priority"],
    description: str(content.description),
    criteria: Array.isArray(content.criteria) ? content.criteria : [],
  } as ProposedFeature;
  return toEditValues(feature);
}

export const issuesOf = (values: EditValues): FormIssue[] => validateEdit(values);

/** Contenu corrigé envoyé à `proposal.decide` (`edited` + `accept`) : la forme exacte de son type, sans champ en trop. */
export function editedContentOf(
  proposal: ProposalOutput,
  values: EditValues,
): Record<string, unknown> {
  const { criteria, title, priority, description } = fromEditValues(values);
  if (proposal.kind === "criteria") return { specId: str(proposal.content.specId), criteria };
  return { title: title.trim(), priority, description, criteria };
}
