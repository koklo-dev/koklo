import type { Tx } from "../tracker/project-transactions.ts";
import type { EntityHash } from "./target-hash.ts";

/** Plafond de lignes lues : un snapshot est borné à quelques milliers de fichiers (`MAX_SPEC_FILES` du worker). */
const MAX_ENTITY_ROWS = 20_000;

/** Hachages de toutes les entités d'un snapshot (vide pour un snapshot d'avant TK-100, pas encore réindexé). */
export async function entityHashesOf(tx: Tx, snapshotId: string): Promise<EntityHash[]> {
  const rows = await tx.specEntity.findMany({
    where: { snapshotId },
    select: { kind: true, specId: true, contentHash: true },
    take: MAX_ENTITY_ROWS,
  });
  return rows.map((row) => ({ kind: row.kind, specId: row.specId, hash: row.contentHash }));
}

/** Hachage courant de chaque fonctionnalité (ou des seules `specIds`), par snapshot (lecture groupée des lecteurs de validation). */
export async function featureHashesOf(
  tx: Tx,
  snapshotIds: readonly string[],
  specIds?: readonly string[],
): Promise<Map<string, Map<string, string>>> {
  const rows = await tx.specEntity.findMany({
    where: {
      snapshotId: { in: [...snapshotIds] },
      kind: "feature",
      ...(specIds ? { specId: { in: [...specIds] } } : {}),
    },
    select: { snapshotId: true, specId: true, contentHash: true },
    take: MAX_ENTITY_ROWS,
  });
  const bySnapshot = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const hashes = bySnapshot.get(row.snapshotId) ?? new Map<string, string>();
    hashes.set(row.specId, row.contentHash);
    bySnapshot.set(row.snapshotId, hashes);
  }
  return bySnapshot;
}
