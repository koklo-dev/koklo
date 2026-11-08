import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaPageRecord } from "./idea.repository.ts";

export const IDEA_PROPOSAL_REPOSITORY = Symbol("IDEA_PROPOSAL_REPOSITORY");

export type IdeaProposalOp = "insert_after" | "replace" | "append" | "create_page";
export type IdeaProposalStatus = "pending" | "accepted" | "rejected" | "stale";

/** Une proposition de l'agent : jamais appliquée sans la décision d'un humain. */
export interface IdeaProposalRecord {
  id: string;
  messageId: string;
  pageId: string | null;
  op: IdeaProposalOp;
  anchorBlockIndex: number | null;
  rangeEnd: number | null;
  title: string | null;
  afterPageId: string | null;
  contentMd: string;
  rationale: string;
  baseVersion: number | null;
  status: IdeaProposalStatus;
  createdAt: Date;
}

/** `page` : la page modifiée ou créée (accepter, annuler une acceptation), `null` pour un rejet. */
export interface IdeaProposalOutcome {
  proposal: IdeaProposalRecord;
  page: IdeaPageRecord | null;
}

export interface IdeaDecisionActor {
  now: Date;
}

/**
 * Décisions sur les propositions (TK-90). Chaque méthode est une transaction (page, proposition, contributeur, audit).
 * Refus typés levés depuis la transaction : `NOT_FOUND` (autre projet compris), `CONFLICT` (+ `currentVersion`,
 * la proposition devient `stale` ; la rejeter reste permis, B253), `VALIDATION` (plus en attente, rien à annuler, dossier plein, texte trop long).
 */
export interface IdeaProposalRepository {
  decide(
    scope: ProjectScope,
    actor: IdeaDecisionActor,
    proposalId: string,
    decision: "accept" | "reject",
    contentMd: string | undefined,
  ): Promise<IdeaProposalOutcome>;
  undo(
    scope: ProjectScope,
    actor: IdeaDecisionActor,
    proposalId: string,
  ): Promise<IdeaProposalOutcome>;
}
