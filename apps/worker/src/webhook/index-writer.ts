import { raiseCounterTo, type TenantClient, type TenantTx, withOrganization } from "@koklo/db";
import type { ParsedSpec } from "@koklo/schema";
import { featureCounterOf, type IndexRows, rowsOf } from "./index-rows.ts";
import type { Target } from "./types.ts";

/** Une transaction d'écriture d'index dure quelques requêtes en lot, sans réseau : 30 s au plus. */
const TRANSACTION_TIMEOUT_MS = 30_000;
/** Lignes par `createMany` : reste sous la limite de paramètres liés d'une requête. */
const CHUNK = 1000;

/** Ce qu'il faut écrire pour un commit : un snapshot lisible avec ses entités, ou un snapshot en échec. */
export type SnapshotWrite =
  | { readonly status: "ready"; readonly spec: ParsedSpec }
  | { readonly status: "failed"; readonly errorCode: string };

export interface WriteResult {
  /** Plus grand `F-nnn` relevé dans le compteur, s'il y en avait un. */
  readonly counterRaisedTo: number | undefined;
  /** Identifiants `F-nnn` trop grands, indexés mais écartés du compteur. */
  readonly counterSkipped: number;
}

const chunks = <T>(rows: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let start = 0; start < rows.length; start += CHUNK)
    out.push(rows.slice(start, start + CHUNK));
  return out;
};

async function insertEntities(
  tx: TenantTx,
  organizationId: string,
  snapshotId: string,
  rows: IndexRows,
): Promise<void> {
  const scoped = <T extends object>(row: T) => ({ ...row, organizationId });
  for (const part of chunks(rows.features)) {
    await tx.specFeature.createMany({
      data: part.map((row) => scoped({ ...row, snapshotId })),
    });
  }
  for (const part of chunks(rows.criteria)) {
    await tx.specCriterion.createMany({ data: part.map(scoped) });
  }
  for (const part of chunks(rows.tableLinks)) {
    await tx.specFeatureTable.createMany({ data: part.map(scoped) });
  }
  for (const part of chunks(rows.endpointLinks)) {
    await tx.specFeatureEndpoint.createMany({ data: part.map(scoped) });
  }
  for (const part of chunks(rows.tables)) {
    await tx.specTable.createMany({ data: part.map((row) => scoped({ ...row, snapshotId })) });
  }
  for (const part of chunks(rows.endpoints)) {
    await tx.specEndpoint.createMany({ data: part.map((row) => scoped({ ...row, snapshotId })) });
  }
}

/**
 * Écrit l'index d'un commit. Une seule transaction, sans appel réseau : snapshot (créé, ou repris
 * s'il était `building|failed` après purge de ses entités), entités, jointures, déplacement de la
 * tête de branche et relevé du compteur `feature`. Tout ou rien.
 */
export class IndexWriter {
  private readonly client: TenantClient;
  constructor(client: TenantClient) {
    this.client = client;
  }

  async write(
    target: Target,
    branch: string,
    commitSha: string,
    snapshot: SnapshotWrite,
  ): Promise<WriteResult> {
    const { organizationId } = target.installation;
    const { id: repoId, projectId } = target.repo;
    const rows = snapshot.status === "ready" ? rowsOf(snapshot.spec) : undefined;
    const counter = snapshot.status === "ready" ? featureCounterOf(snapshot.spec) : { skipped: 0 };
    await withOrganization(organizationId, () =>
      this.client.$transaction(
        async (tx) => {
          const snapshotId = await this.reset(tx, { organizationId, repoId, commitSha }, snapshot);
          if (rows) await insertEntities(tx, organizationId, snapshotId, rows);
          await tx.specHead.upsert({
            where: { repoId_branch: { repoId, branch } },
            create: { organizationId, repoId, branch, snapshotId },
            update: { snapshotId },
          });
          if (counter.raiseTo !== undefined) {
            await raiseCounterTo(tx, { organizationId, projectId }, "feature", counter.raiseTo);
          }
        },
        { timeout: TRANSACTION_TIMEOUT_MS },
      ),
    );
    return { counterRaisedTo: counter.raiseTo, counterSkipped: counter.skipped };
  }

  /** Crée le snapshot du commit, ou reprend celui qui existe en le vidant de ses entités. */
  private async reset(
    tx: TenantTx,
    key: { organizationId: string; repoId: string; commitSha: string },
    snapshot: SnapshotWrite,
  ): Promise<string> {
    const state = {
      status: snapshot.status,
      errorCode: snapshot.status === "failed" ? snapshot.errorCode : null,
      indexedAt: new Date(),
    };
    const existing = await tx.specSnapshot.findFirst({
      where: { repoId: key.repoId, commitSha: key.commitSha },
      select: { id: true },
    });
    if (!existing) {
      const created = await tx.specSnapshot.create({
        data: { ...key, ...state },
        select: { id: true },
      });
      return created.id;
    }
    await tx.specFeature.deleteMany({ where: { snapshotId: existing.id } });
    await tx.specTable.deleteMany({ where: { snapshotId: existing.id } });
    await tx.specEndpoint.deleteMany({ where: { snapshotId: existing.id } });
    await tx.specSnapshot.updateMany({ where: { id: existing.id }, data: state });
    return existing.id;
  }
}
