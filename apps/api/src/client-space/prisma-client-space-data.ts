import { Inject, Injectable } from "@nestjs/common";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  ClientFixtureRead,
  ClientModelRead,
  ClientSpaceDataRepository,
} from "./client-space-data.repository.ts";
import { labelOf } from "./client-space-entities.ts";

const SOURCE = /^(F-\d{3,}|R-\d{3,})$/;
/** Un projet compte quelques dizaines de jeux : lecture bornée. */
const MAX_FIXTURES = 200;

const sourcesOf = (data: unknown): string[] => {
  const source = (data as { source?: unknown } | null)?.source;
  return Array.isArray(source)
    ? source.filter((id): id is string => typeof id === "string" && SOURCE.test(id))
    : [];
};

/** Lecture seule de l'index d'entités de la tête (jamais d'instantané en échec ni non indexé). */
@Injectable()
export class PrismaClientSpaceData implements ClientSpaceDataRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
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
      const ids = [...new Set(tables.flatMap((table) => sourcesOf(table.data)))];
      const cited =
        ids.length === 0
          ? []
          : await tx.specEntity.findMany({
              where: { snapshotId, kind: { in: ["feature", "rule"] }, specId: { in: ids } },
              select: { specId: true, data: true },
              take: ids.length * 2,
            });
      return {
        tables,
        truncated: rows.length > max,
        labels: new Map(cited.map((row) => [row.specId, labelOf(row.specId, row.data)])),
      };
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
