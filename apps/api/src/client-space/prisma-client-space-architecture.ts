import { Inject, Injectable } from "@nestjs/common";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  ClientArchitectureRead,
  ClientSpaceArchitectureRepository,
} from "./client-space-architecture.repository.ts";
import { labelOf } from "./client-space-entities.ts";

/** Un projet compte quelques centaines de composants : la lecture des noms est bornée. */
const MAX_NAMES = 1000;
const FEATURE = /^F-\d{3,}$/;

const featureIdsOf = (data: unknown): string[] => {
  const served = (data as { sert?: unknown } | null)?.sert;
  return Array.isArray(served)
    ? served.filter((id): id is string => typeof id === "string" && FEATURE.test(id))
    : [];
};

/** Lecture seule de l'index d'entités de la tête (jamais d'instantané en échec ni non indexé). */
@Injectable()
export class PrismaClientSpaceArchitecture implements ClientSpaceArchitectureRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
  ) {}

  read(scope: ProjectScope, max: number): Promise<ClientArchitectureRead | null> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, {});
      const snapshot = found?.snapshot;
      if (!snapshot || snapshot.status === "failed" || snapshot.entitiesIndexedAt === null) {
        return null;
      }
      const rows = await tx.specEntity.findMany({
        where: { snapshotId: snapshot.id, kind: "component" },
        orderBy: [{ sort: "asc" }, { id: "asc" }],
        take: MAX_NAMES,
        select: { specId: true, data: true },
      });
      const components = rows.slice(0, max);
      return {
        components,
        truncated: rows.length > max,
        names: new Map(rows.map((row) => [row.specId, labelOf(row.specId, row.data)])),
        labels: await this.labelsIn(
          tx,
          snapshot.id,
          components.flatMap((row) => featureIdsOf(row.data)),
        ),
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
      where: { snapshotId, kind: "feature", specId: { in: ids } },
      select: { specId: true, data: true },
      take: ids.length,
    });
    return new Map(cited.map((row) => [row.specId, labelOf(row.specId, row.data)]));
  }
}
