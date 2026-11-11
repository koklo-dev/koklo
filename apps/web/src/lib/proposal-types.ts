import type { proposalListOutputSchema, proposalSchema } from "@koklo/contract";
import type { z } from "zod";

export type ProposalOutput = z.infer<typeof proposalSchema>;
export type ProposalListOutput = z.infer<typeof proposalListOutputSchema>;
export type ProposalGroupOutput = ProposalListOutput["groups"][number];
