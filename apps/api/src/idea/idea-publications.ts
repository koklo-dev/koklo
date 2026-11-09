import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";

/** Lots de publication de l'espace Idée examinés à chaque lecture de la liste. */
const RECENT_BATCHES = 20;

/**
 * Trace des publications (choix du lot A, « hook au poll ») : un lot `committed` portant une opération
 * `idea.index.write` devient une ligne `idea_publications` à la première lecture de la liste qui le voit.
 * Idempotent (unicité projet + lot, `skipDuplicates`) et sans effet pour les lots d'autres natures. Le
 * lot B pourra déplacer cette écriture dans le worker sans changer le contrat.
 */
export async function reconcilePublications(tx: Tx, scope: ProjectScope, now: Date): Promise<void> {
  await reconcileIdeaVersions(tx, scope, now);
  const batches = await tx.specWriteBatch.findMany({
    where: {
      projectId: scope.projectId,
      status: "committed",
      commitSha: { not: null },
      operations: { some: { kind: "idea.index.write" } },
    },
    orderBy: { enqueuedAt: "desc" },
    take: RECENT_BATCHES,
    select: {
      id: true,
      commitSha: true,
      authorUserId: true,
      committedAt: true,
      operations: { where: { kind: "idea.index.write" }, select: { payload: true } },
    },
  });
  if (batches.length === 0) return;
  const known = await tx.ideaPublication.findMany({
    where: { projectId: scope.projectId, batchId: { in: batches.map((b) => b.id) } },
    select: { batchId: true },
  });
  const seen = new Set(known.map((row) => row.batchId));
  const missing = batches.filter((batch) => !seen.has(batch.id) && batch.commitSha !== null);
  if (missing.length === 0) return;
  await tx.ideaPublication.createMany({
    skipDuplicates: true,
    data: missing.map((batch) => ({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      batchId: batch.id,
      commitSha: batch.commitSha as string,
      publishedBy: batch.authorUserId,
      publishedAt: batch.committedAt ?? now,
      pagesVersions: versionsOf(batch.operations[0]?.payload),
    })),
  });
}

function versionsOf(payload: unknown): object {
  const versions = (payload as { pagesVersions?: unknown } | null)?.pagesVersions;
  return typeof versions === "object" && versions !== null && !Array.isArray(versions)
    ? versions
    : {};
}

/** Une version sans lot (passage interrompu avant l'enfilage) est abandonnée après ce délai. */
export const ABANDONED_VERSION_MS = 5 * 60_000;

/**
 * Versions figées (TK-91, B259) : une version dont le lot est `committed` reçoit son commit ; une dont le lot a échoué
 * (`failed`, `conflict`) ou a disparu est supprimée, pour que la numérotation reste sans trou ; une version qui n'a
 * jamais reçu de lot est abandonnée au bout de 5 minutes. Idempotent.
 */
export async function reconcileIdeaVersions(tx: Tx, scope: ProjectScope, now: Date): Promise<void> {
  const open = await tx.ideaVersion.findMany({
    where: { projectId: scope.projectId, commitSha: null },
    select: { id: true, batchId: true, frozenAt: true },
  });
  if (open.length === 0) return;
  const batches = await tx.specWriteBatch.findMany({
    where: {
      projectId: scope.projectId,
      id: { in: open.flatMap((version) => version.batchId ?? []) },
    },
    select: { id: true, status: true, commitSha: true },
  });
  const byId = new Map(batches.map((batch) => [batch.id, batch]));
  const dropped: string[] = [];
  for (const version of open) {
    const batch = version.batchId === null ? undefined : byId.get(version.batchId);
    if (batch?.status === "committed" && batch.commitSha !== null) {
      await tx.ideaVersion.update({
        where: { id: version.id },
        data: { commitSha: batch.commitSha },
      });
    } else if (isLost(version, batch, now)) {
      dropped.push(version.id);
    }
  }
  if (dropped.length > 0) await tx.ideaVersion.deleteMany({ where: { id: { in: dropped } } });
}

function isLost(
  version: { batchId: string | null; frozenAt: Date },
  batch: { status: string } | undefined,
  now: Date,
): boolean {
  if (version.batchId === null)
    return now.getTime() - version.frozenAt.getTime() > ABANDONED_VERSION_MS;
  return batch === undefined || batch.status === "failed" || batch.status === "conflict";
}
