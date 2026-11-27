import type { Deliverable } from "./proposal-labels.ts";
import { asSecurity } from "./proposal-security.ts";
import { asTechnical } from "./proposal-technical.ts";
import type { ProposalOutput } from "./proposal-types.ts";

const MARKS: Partial<Record<Deliverable, (proposal: ProposalOutput) => ProposalOutput>> = {
  technical: asTechnical,
  security: asSecurity,
};

/** Marque les sections de document d'un livrable : la liste des propositions ne dit pas lequel. */
export const markerOf = (deliverable: Deliverable) =>
  MARKS[deliverable] ?? ((proposal: ProposalOutput) => proposal);
