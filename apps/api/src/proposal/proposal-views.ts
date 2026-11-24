import { launchReportSchema, type ProposalListOutput } from "@koklo/contract";
import { LAUNCH_DISCARD_REASONS } from "@koklo/domain";
import type { LaunchProgress, LaunchRecord } from "./launch.repository.ts";
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

type Report = NonNullable<Launch["report"]>;

const countsOf = (counts: unknown): Record<string, unknown> =>
  typeof counts === "object" && counts !== null ? (counts as Record<string, unknown>) : {};
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

/** Motifs comptés dans l'ordre du vocabulaire fermé ; un motif inconnu ou un compte nul est ignoré. */
const reasonsOf = (counts: unknown): Report["discardReasons"] => {
  const record = countsOf(counts);
  return LAUNCH_DISCARD_REASONS.flatMap((reason) => {
    const count = record[reason];
    return isCount(count) ? [{ reason, count }] : [];
  });
};

/** Sections déjà présentes écartées au triage (TK-114e, B670, B677) : clé `existing_section`, hors des motifs de zone. */
const sectionsExistingOf = (counts: unknown): { sectionsExisting?: number } => {
  const count = countsOf(counts).existing_section;
  return isCount(count) ? { sectionsExisting: count } : {};
};

/** Bilan du lancement (TK-114b, B620) : colonnes validées par le schéma du contrat, `undefined` si l'une est illisible. */
function reportOf(progress: LaunchProgress): Report | undefined {
  if (!Array.isArray(progress.zones)) return undefined;
  const parsed = launchReportSchema.safeParse({
    zonesRequested: progress.zones.length,
    zonesDone: progress.zonesDone,
    zonesDiscarded: progress.zonesDiscarded,
    discardReasons: reasonsOf(progress.discardReasons),
    ...(progress.coverageBefore === null ? {} : { coverageBefore: progress.coverageBefore }),
    ...(progress.coverageAfter === null ? {} : { coverageAfter: progress.coverageAfter }),
    coverageCalls: progress.coverageCalls,
    ...(progress.stopReason === null ? {} : { stopReason: progress.stopReason }),
    ...sectionsExistingOf(progress.discardReasons),
  });
  return parsed.success ? parsed.data : undefined;
}

/** Le lancement tel que la relecture l'affiche : aucun identifiant d'utilisateur, aucun texte du fournisseur. */
export const launchView = (launch: LaunchRecord): Launch => {
  const report = launch.deliverable === "architecture" ? reportOf(launch.progress) : undefined;
  return {
    id: launch.id,
    status: launch.status,
    proposedCount: launch.proposedCount,
    discardedCount: launch.discardedCount,
    ...(launch.errorCode === null ? {} : { errorCode: launch.errorCode }),
    ...(launch.finishedAt === null ? {} : { finishedAt: launch.finishedAt.toISOString() }),
    ...(report === undefined ? {} : { report }),
  };
};
