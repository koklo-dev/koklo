import type { SpecBatchSubmitInput } from "@koklo/contract";
import type { FramingProposal } from "./framing-types.ts";

type Operations = SpecBatchSubmitInput["operations"];

/** SQUELETTE (TK-59 Red) : opérations `feature.create` des seules propositions acceptées, dans l'ordre affiché. */
export function acceptedOperations(_proposals: FramingProposal[]): Operations {
  throw new Error("TK-59 : acceptedOperations n'est pas implémenté");
}
