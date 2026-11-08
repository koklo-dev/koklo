import type { Tx } from "../tracker/project-transactions.ts";
import type {
  IdeaProposalOp,
  IdeaProposalRecord,
  IdeaProposalStatus,
} from "./idea-proposal.repository.ts";

/** Colonnes lues d'une proposition (jamais d'identifiant d'utilisateur : `decidedBy` reste en base). */
export const PROPOSAL = {
  id: true,
  messageId: true,
  pageId: true,
  op: true,
  anchorBlockIndex: true,
  rangeEnd: true,
  title: true,
  afterPageId: true,
  contentMd: true,
  rationale: true,
  baseVersion: true,
  status: true,
  createdAt: true,
} as const;

export interface ProposalRow {
  id: string;
  messageId: string;
  pageId: string | null;
  op: string;
  anchorBlockIndex: number | null;
  rangeEnd: number | null;
  title: string | null;
  afterPageId: string | null;
  contentMd: string;
  rationale: string;
  baseVersion: number | null;
  status: string;
  createdAt: Date;
}

export const proposalRecord = (row: ProposalRow): IdeaProposalRecord => ({
  ...row,
  op: row.op as IdeaProposalOp,
  status: row.status as IdeaProposalStatus,
});

/**
 * Les propositions en attente d'une page deviennent périmées : leur ancre (rang de bloc) n'a de sens qu'à la version
 * où elles ont été faites (B223). Appelé dans la transaction qui change la version de la page ou la retire.
 */
export const staleProposalsOf = (tx: Tx, projectId: string, pageId: string, exceptId?: string) =>
  tx.ideaProposal.updateMany({
    where: {
      projectId,
      pageId,
      status: "pending",
      ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
    },
    data: { status: "stale" },
  });
