import { Inject, Injectable } from "@nestjs/common";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  ClientFixtureRead,
  ClientModelRead,
  ClientSpaceDataRepository,
} from "./client-space-data.repository.ts";
import { sourceIdsOf } from "./client-space-data.ts";
import { labelOf } from "./client-space-entities.ts";

/** Un projet compte quelques dizaines de jeux : lecture bornée. */
const MAX_FIXTURES = 200;

/** Lecture seule de l'index d'entités de la tête (jamais d'instantané en échec ni non indexé). */
@Injectable()
export class PrismaClientSpaceData implements ClientSpaceDataRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
    @Inject(FullTextSearch) private readonly search: FullTextSearch,
  ) {}

  private async snapshotId(tx: Tx, scope: ProjectScope): Promise<string | null> {
    const found = await this.resolver.resolve(tx, scope, {});
    const snapshot = found?.snapshot;
    return snapshot && snapshot.status !== "failed" && snapshot.entitiesIndexedAt !== null
      ? snapshot.id
      : null;
  }

  model(scope: ProjectScope, max: number): Promise<ClientModelRead | null> {
    return this.transactions.run(scope, async (tx) => {
      const snapshotId = await this.snapshotId(tx, scope);
      if (snapshotId === null) return null;
      const rows = await tx.specEntity.findMany({
        where: { snapshotId, kind: "table" },
        orderBy: [{ sort: "asc" }, { id: "asc" }],
        take: max + 1,
        select: { specId: true, data: true },
      });
      const tables = rows.slice(0, max);
      const ids = tables.flatMap((table) => sourceIdsOf(table.data));
      return {
        tables,
        truncated: rows.length > max,
        labels: await this.labelsIn(tx, snapshotId, ids),
      };
    });
  }

  private async labelsIn(
    tx: Tx,
    snapshotId: string,
    sources: readonly string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(sources)];
    if (ids.length === 0) return new Map();
    const cited = await tx.specEntity.findMany({
      where: { snapshotId, kind: { in: ["feature", "rule"] }, specId: { in: ids } },
      select: { specId: true, data: true },
      take: ids.length * 2,
    });
    return new Map(cited.map((row) => [row.specId, labelOf(row.specId, row.data)]));
  }

  tables(scope: ProjectScope): Promise<{ specId: string; data: unknown }[] | null> {
    return this.transactions.run(scope, async (tx) => {
      const snapshotId = await this.snapshotId(tx, scope);
      if (snapshotId === null) return null;
      return tx.specEntity.findMany({
        where: { snapshotId, kind: "table" },
        orderBy: [{ sort: "asc" }, { id: "asc" }],
        select: { specId: true, data: true },
      });
    });
  }

  labels(scope: ProjectScope, ids: readonly string[]): Promise<Map<string, string>> {
    return this.transactions.run(scope, async (tx) => {
      const snapshotId = await this.snapshotId(tx, scope);
      return snapshotId === null ? new Map() : this.labelsIn(tx, snapshotId, ids);
    });
  }

  searchTables(scope: ProjectScope, q: string, limit: number) {
    return this.transactions.run(scope, async (tx) => {
      const snapshotId = await this.snapshotId(tx, scope);
      if (snapshotId === null) return [];
      const ids = await this.search.entityIds(snapshotId, "table", q);
      if (ids.length === 0) return [];
      return tx.specEntity.findMany({
        where: { snapshotId, kind: "table", id: { in: [...ids] } },
        orderBy: [{ sort: "asc" }, { id: "asc" }],
        select: { specId: true, data: true },
        take: limit,
      });
    });
  }

  fixtures(scope: ProjectScope): Promise<ClientFixtureRead[]> {
    return this.transactions.run(scope, async (tx) => {
      const snapshotId = await this.snapshotId(tx, scope);
      if (snapshotId === null) return [];
      return tx.specEntity.findMany({
        where: { snapshotId, kind: "fixture" },
        orderBy: [{ sort: "asc" }, { id: "asc" }],
        take: MAX_FIXTURES,
        select: { specId: true, path: true, data: true },
      });
    });
  }

  fixture(scope: ProjectScope, specId: string): Promise<ClientFixtureRead | null> {
    return this.transactions.run(scope, async (tx) => {
      const snapshotId = await this.snapshotId(tx, scope);
      if (snapshotId === null) return null;
      return tx.specEntity.findFirst({
        where: { snapshotId, kind: "fixture", specId },
        select: { specId: true, path: true, data: true },
      });
    });
  }
}
