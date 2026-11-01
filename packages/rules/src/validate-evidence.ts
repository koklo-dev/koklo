import type { EvidenceResult } from "./evidence-types.ts";
import type { Resolution } from "./resolve-types.ts";

/** SQUELETTE (TK-71 lot C, Red) : verdicts PASS / FAIL / UNVERIFIED des règles effectives
 *  (équivalent de `engineering-rules validate`). Pure, ne lève jamais, ne copie aucune preuve. */
export const validateEvidence = (_resolution: Resolution, _artifact: unknown): EvidenceResult => {
  throw new Error("not implemented: validateEvidence");
};
