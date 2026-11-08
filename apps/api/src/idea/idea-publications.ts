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
