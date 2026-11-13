import type { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { UpstreamFacts } from "./deliverable-upstream.ts";

const SOURCE = /^(F-\d{3,}|R-\d{3,})$/;
/** Un modèle compte au plus quelques centaines de tables (le diagramme en borne 500) : lecture bornée. */
const MAX_TABLES = 1000;

const sourcesOf = (data: unknown): string[] => {
  const source = (data as { source?: unknown } | null)?.source;
  return Array.isArray(source)
    ? source.filter((id): id is string => typeof id === "string" && SOURCE.test(id))
    : [];
};

async function hashesAt(tx: Tx, snapshotId: string, ids: readonly string[]) {
  const rows = await tx.specEntity.findMany({
    where: { snapshotId, kind: { in: ["feature", "rule"] }, specId: { in: [...ids] } },
    select: { specId: true, contentHash: true },
    take: ids.length * 2,
  });
  return new Map(rows.map((row) => [row.specId, row.contentHash]));
}

/**
 * Faits de l'impact amont des Données (B449) : sources citées par les tables de la tête, hachages de ces amonts à la tête
 * de la dernière décision et à la tête courante. `null` : jamais décidé, rien d'indexé, ou aucune source citée ; la tête
 * de la décision hors index donne `atDecision` nul (aucun impact, jamais de faux « À revoir »).
 */
export async function readUpstreamFacts(
  tx: Tx,
  resolver: SpecHeadResolver,
  scope: ProjectScope,
): Promise<UpstreamFacts | null> {
  const decision = await tx.review.findFirst({
    where: { projectId: scope.projectId, targetKind: "deliverable", targetRef: "data" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { sha: true },
  });
  if (!decision) return null;
  const head = await resolver.resolve(tx, scope, {});
  if (!head || head.snapshot.status === "failed") return null;
  const tables = await tx.specEntity.findMany({
    where: { snapshotId: head.snapshot.id, kind: "table" },
    select: { data: true },
    take: MAX_TABLES,
  });
  const sources = [...new Set(tables.flatMap((row) => sourcesOf(row.data)))];
  if (sources.length === 0) return null;
  const decided = await resolver.resolve(tx, scope, { commitSha: decision.sha });
  const indexed = decided !== null && decided.snapshot.status !== "failed";
  return {
    sources,
    atDecision: indexed ? await hashesAt(tx, decided.snapshot.id, sources) : null,
    atHead: await hashesAt(tx, head.snapshot.id, sources),
  };
}
