import { conflictOf, notFoundError, proposalCountChangedError, validationError } from "./errors.ts";
import { route, writeErrors } from "./route-helpers.ts";
import {
  proposalDecideInputSchema,
  proposalDecideManyInputSchema,
  proposalDecideManyOutputSchema,
  proposalListInputSchema,
  proposalListOutputSchema,
  proposalSchema,
} from "./schemas-proposals.ts";

const base = { ...writeErrors, ...notFoundError, ...validationError } as const;

/**
 * Relecture et décision des propositions de l'agent (TK-99a, contrat 2.9.0) : `SPEC_BATCH_ROLES` seulement, le
 * client et le business reçoivent 403 sur tout. Décider ne modifie jamais la spec : `specBatch.submit` seul écrit.
 */
export const proposal = {
  list: route("GET", "/projects/{projectId}/proposals")
    .errors(base)
    .input(proposalListInputSchema)
    .output(proposalListOutputSchema),
  /** Une proposition déjà appliquée par un lot n'est jamais modifiable : 409 CONFLICT `proposal_applied`. */
  decide: route("POST", "/projects/{projectId}/proposals/{proposalId}/decision")
    .errors({ ...base, ...conflictOf("proposal_applied") })
    .input(proposalDecideInputSchema)
    .output(proposalSchema),
  /** Agit sur TOUTES les propositions en attente du groupe ; un N périmé est refusé (409). */
  decideMany: route("POST", "/projects/{projectId}/proposals/decisions")
    .errors({ ...base, ...proposalCountChangedError })
    .input(proposalDecideManyInputSchema)
    .output(proposalDecideManyOutputSchema),
};
