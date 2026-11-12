import type { ProposalListOutput } from "@koklo/contract";
import type { LaunchRecord } from "./launch.repository.ts";
import type { ProposalRecord } from "./proposal.repository.ts";

type Item = ProposalListOutput["items"][number];
type Launch = NonNullable<ProposalListOutput["launch"]>;

/** La proposition telle que le contrat la rend : la colonne `payload` y devient `content`. */
export const proposalView = (record: ProposalRecord): Item => ({
  id: record.id,
  launchId: record.launchId,
  kind: record.kind,
  zone: record.zone,
  position: record.position,
  title: record.title,
  rationale: record.rationale,
  content: record.payload,
  status: record.status,
  appliedBatchId: record.appliedBatchId,
  createdAt: record.createdAt.toISOString(),
});

/** Le lancement tel que la relecture l'affiche : aucun identifiant d'utilisateur, aucun texte du fournisseur. */
export const launchView = (launch: LaunchRecord): Launch => ({
  id: launch.id,
  status: launch.status,
  proposedCount: launch.proposedCount,
  discardedCount: launch.discardedCount,
  ...(launch.errorCode === null ? {} : { errorCode: launch.errorCode }),
  ...(launch.finishedAt === null ? {} : { finishedAt: launch.finishedAt.toISOString() }),
});
