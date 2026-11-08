import type { IdeaPage, IdeaPageSummary, IdeaProposal } from "@koklo/contract";
import type { IdeaPageRecord } from "./idea.repository.ts";
import type { IdeaProposalRecord } from "./idea-proposal.repository.ts";

/** Vues du contrat (instants en ISO, jamais d'identifiant d'utilisateur) des enregistrements de l'espace Idée. */
export const summaryOf = (record: IdeaPageRecord): IdeaPageSummary => ({
  id: record.id,
  slug: record.slug,
  title: record.title,
  position: record.position,
  required: record.required,
  origin: record.origin,
  status: record.status,
  version: record.version,
  updatedAt: record.updatedAt.toISOString(),
  updatedBy: record.updatedBy,
  deletedAt: record.deletedAt?.toISOString() ?? null,
});

export const pageOf = (record: IdeaPageRecord): IdeaPage => ({
  ...summaryOf(record),
  contentMd: record.contentMd ?? "",
});

export const proposalOf = (record: IdeaProposalRecord): IdeaProposal => ({
  id: record.id,
  messageId: record.messageId,
  pageId: record.pageId,
  op: record.op,
  anchorBlockIndex: record.anchorBlockIndex,
  rangeEnd: record.rangeEnd,
  title: record.title,
  afterPageId: record.afterPageId,
  contentMd: record.contentMd,
  rationale: record.rationale,
  baseVersion: record.baseVersion,
  status: record.status,
  createdAt: record.createdAt.toISOString(),
});
