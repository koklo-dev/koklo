import type { Prisma, TenantClient } from "@koklo/db";
import type { LaunchDiscardReason } from "@koklo/domain";
import { isRecord, stringsOf } from "../job-support.ts";
import { type Complement, type PublishedProposal, unionOf } from "./coverage.ts";
import { rowsOf } from "./publish.ts";
import type {
  Claim,
  CoveragePublication,
  LaunchContext,
  LaunchProgress,
  PublishOutcome,
  ZonePublication,
} from "./store.ts";

/**
 * Écritures du bilan d'un lancement (TK-114b, B617-B621), sorties de `AgentProposeStore` : prise d'un job de suite,
 * publication d'une zone avec son motif, publication de la couverture (créations et compléments), relecture des propositions.
 * Toujours sous `withOrganization` (appelées par le magasin), `where { id: launch.id }`.
 */
type Writer = Pick<TenantClient, "agentLaunch" | "agentProposal">;

const json = (value: unknown) => value as Prisma.InputJsonValue;
/** Zone de repli d'une ligne de couverture sans zone propre (un flux technique). */
const COVERAGE_ZONE = "Flux techniques";

interface ProgressRow {
  readonly segment: number;
  readonly zones: unknown;
  readonly zonesDone: number;
  readonly zonesDiscarded: number;
  readonly coverageCalls: number;
  readonly coverageStalled: number;
}

export const progressOf = (row: ProgressRow): LaunchProgress => ({
  segment: row.segment,
  zones: stringsOf(row.zones),
  zonesDone: row.zonesDone,
  zonesDiscarded: row.zonesDiscarded,
  coverageCalls: row.coverageCalls,
  coverageStalled: row.coverageStalled,
});

/** Job de suite du segment `segment` : il prend le relais posé par le précédent, une seule fois. */
export async function claimSegment(
  client: Writer,
  row: ProgressRow & { status: string; handoffAt: Date | null },
  launch: LaunchContext,
  segment: number,
  now: Date,
): Promise<Claim> {
  if (row.status !== "running" || row.segment !== segment) return { kind: "settled" };
  if (row.handoffAt === null) return { kind: "lost", launch };
  const { count } = await client.agentLaunch.updateMany({
    where: { id: launch.id, status: "running", segment, handoffAt: { not: null } },
    data: { handoffAt: null, heartbeatAt: now },
  });
  return count === 0 ? { kind: "settled" } : { kind: "ready", launch, progress: progressOf(row) };
}

/** Liens ajoutés à une charge de composant, 200 au plus par liste ; une liste sans ajout reste telle quelle. */
export function mergeLinks(
  payload: Record<string, unknown>,
  complement: Pick<Complement, "owns" | "serves">,
): Record<string, unknown> {
  const merged = { ...payload };
  if (complement.owns.length > 0) merged.owns = unionOf(stringsOf(payload.owns), complement.owns);
  if (complement.serves.length > 0) {
    merged.serves = unionOf(stringsOf(payload.serves), complement.serves);
  }
  return merged;
}

const countedReason = (current: unknown, reason: LaunchDiscardReason) => {
  const counts = isRecord(current) ? current : {};
  const previous = typeof counts[reason] === "number" ? (counts[reason] as number) : 0;
  return { ...counts, [reason]: previous + 1 };
};

async function insertRows(
  tx: Writer,
  launch: LaunchContext,
  zone: string,
  candidates: CoveragePublication["accepted"],
) {
  const current = await tx.agentLaunch.findFirst({
    where: { id: launch.id, status: "running" },
    select: { proposedCount: true, discardReasons: true },
  });
  if (!current) return undefined;
  const { rows, overflow } = rowsOf(launch, zone, candidates, current.proposedCount);
  if (rows.length > 0) {
    await tx.agentProposal.createMany({
      data: rows.map((row) => ({ ...row, payload: row.payload as Prisma.InputJsonObject })),
    });
  }
  return { created: rows.length, overflow, discardReasons: current.discardReasons };
}

export async function publishZoneIn(
  tx: Writer,
  launch: LaunchContext,
  publication: ZonePublication,
  now: Date,
): Promise<PublishOutcome> {
  const inserted = await insertRows(tx, launch, publication.zone, publication.accepted);
  if (inserted === undefined) return "stopped";
  const { reason } = publication;
  await tx.agentLaunch.updateMany({
    where: { id: launch.id },
    data: {
      proposedCount: { increment: inserted.created },
      discardedCount: { increment: publication.discarded + inserted.overflow },
      ...(reason === undefined
        ? { zonesDone: { increment: 1 } }
        : {
            zonesDiscarded: { increment: 1 },
            discardReasons: json(countedReason(inserted.discardReasons, reason)),
          }),
      heartbeatAt: now,
    },
  });
  return "published";
}

/** Compléments (B621) : seulement une proposition `pending` non appliquée du lancement, relue dans la transaction. */
async function complete(tx: Writer, launch: LaunchContext, complement: Complement) {
  const where = { id: complement.id, launchId: launch.id, status: "pending", appliedBatchId: null };
  const target = await tx.agentProposal.findFirst({ where, select: { payload: true } });
  if (!target || !isRecord(target.payload)) return;
  await tx.agentProposal.updateMany({
    where,
    data: { payload: json(mergeLinks(target.payload, complement)) },
  });
}

export async function publishCoverageIn(
  tx: Writer,
  launch: LaunchContext,
  publication: CoveragePublication,
  now: Date,
): Promise<PublishOutcome> {
  const inserted = await insertRows(tx, launch, COVERAGE_ZONE, publication.accepted);
  if (inserted === undefined) return "stopped";
  for (const complement of publication.complements) await complete(tx, launch, complement);
  await tx.agentLaunch.updateMany({
    where: { id: launch.id },
    data: {
      proposedCount: { increment: inserted.created },
      discardedCount: { increment: publication.discarded + inserted.overflow },
      ...(publication.call ? { coverageCalls: { increment: 1 } } : {}),
      heartbeatAt: now,
    },
  });
  return "published";
}

/** Propositions du lancement dans l'ordre de publication : de quoi reconstruire le tri et la couverture d'un segment. */
export async function launchProposalsIn(
  client: Writer,
  launch: LaunchContext,
): Promise<PublishedProposal[]> {
  const rows = await client.agentProposal.findMany({
    where: { launchId: launch.id },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: {
      id: true,
      kind: true,
      zone: true,
      title: true,
      status: true,
      appliedBatchId: true,
      payload: true,
    },
  });
  return rows.map(({ appliedBatchId, payload, ...row }) => ({
    ...row,
    applied: appliedBatchId !== null,
    payload: isRecord(payload) ? payload : {},
  }));
}
