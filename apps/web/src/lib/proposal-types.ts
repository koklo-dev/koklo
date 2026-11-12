import type {
  aiProposedFeatureSchema,
  proposalListOutputSchema,
  proposalSchema,
} from "@koklo/contract";
import type { z } from "zod";

export type ProposalOutput = z.infer<typeof proposalSchema>;
export type ProposalListOutput = z.infer<typeof proposalListOutputSchema>;
export type ProposalGroupOutput = ProposalListOutput["groups"][number];

/** Une fonctionnalité telle que l'API la propose : acceptée telle quelle par `specBatch.submit`. */
export type ProposedFeature = z.infer<typeof aiProposedFeatureSchema>;
