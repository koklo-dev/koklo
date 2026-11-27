import { Inject, Injectable } from "@nestjs/common";
import { gitSourceOf, readableHead } from "../spec-architecture/readable-head.ts";
import type { ComponentsPage } from "../spec-architecture/spec-architecture.repository.ts";
import { entitySource, entityWhere } from "../spec-read/entity-list.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import { loadWindow } from "../tracker/long-list.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { SpecTechnicalRepository, StackRequest } from "./spec-technical.repository.ts";
import { readTechnicalCounts } from "./technical-counts.query.ts";
import { stackSummary } from "./technical-values.ts";

const SELECT = { specId: true, path: true, data: true } as const;

const sortedCounts = (values: readonly string[]): Record<string, number> => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
};

/** Lectures de l'index d'entités pour la page Technique (TK-115) : une transaction courte par appel, aucun réseau. */
@Injectable()
export class PrismaSpecTechnicalRepository implements SpecTechnicalRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
    @Inject(FullTextSearch) private readonly search: FullTextSearch,
  ) {}

  private readable(tx: Tx, scope: ProjectScope, revision: Revision) {
    return readableHead(this.resolver, tx, scope, revision);
  }

  stackPage(scope: ProjectScope, revision: Revision, { q, ...window }: StackRequest) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { id: snapshotId } = readable.snapshot;
      const ids = q === undefined ? null : await this.search.entityIds(snapshotId, "stack", q);
      const where = entityWhere(snapshotId, "stack", ids);
      const { rows, ...position } = await loadWindow(
        entitySource(tx, snapshotId, "stack", where),
        window,
      );
      const page: ComponentsPage = {
        items: rows.map(({ specId, path, data }) => ({ specId, path, data })),
        ...position,
        facets: await this.facets(tx, where),
      };
      return { kind: "page" as const, page };
    });
  }

  /** Choix par couche et par statut sur la liste filtrée (aucun filtre propre à ces dimensions). */
  private async facets(tx: Tx, where: ReturnType<typeof entityWhere>) {
    const rows = await tx.specEntity.findMany({ where, select: SELECT });
    const choices = rows.map((row) => stackSummary(row.specId, row.path, row.data));
    return {
      layer: sortedCounts(choices.map((choice) => choice.layer)),
      status: sortedCounts(choices.map((choice) => choice.status)),
    };
  }

  stack(scope: ProjectScope, revision: Revision, id: string) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { found, snapshot } = readable;
      const row = await tx.specEntity.findFirst({
        where: { snapshotId: snapshot.id, kind: "stack", specId: id },
        select: SELECT,
      });
      if (!row) return null;
      return { kind: "found" as const, row, source: await gitSourceOf(tx, found, snapshot) };
    });
  }

  environments(scope: ProjectScope, revision: Revision) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { id: snapshotId, commitSha } = readable.snapshot;
      const row = await tx.specEntity.findFirst({
        where: { snapshotId, kind: "environments" },
        select: SELECT,
      });
      return { kind: "found" as const, row, commitSha };
    });
  }

  counts(scope: ProjectScope) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, {});
      if (readable === null || "kind" in readable) return null;
      return readTechnicalCounts(tx, readable.snapshot.id);
    });
  }
}
