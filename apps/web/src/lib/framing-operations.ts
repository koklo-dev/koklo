import type { SpecBatchSubmitInput } from "@koklo/contract";
import type { FramingProposal } from "./framing-types.ts";

type Operations = SpecBatchSubmitInput["operations"];

/**
 * Opérations `feature.create` des seules propositions acceptées, dans l'ordre affiché, avec leur valeur courante
 * (éditions comprises). Ni statut ni lien : l'API applique les valeurs par défaut (S-framing §3.6).
 */
export function acceptedOperations(proposals: FramingProposal[]): Operations {
  return proposals
    .filter((proposal) => proposal.status === "accepted")
    .map(({ value }) => ({
      kind: "feature.create",
      title: value.title.trim(),
      priority: value.priority,
      description: value.description,
      criteria: value.criteria.map((criterion) => ({
        title: criterion.title,
        steps: criterion.steps.map((step) => ({ type: step.type, text: step.text })),
      })),
    }));
}
