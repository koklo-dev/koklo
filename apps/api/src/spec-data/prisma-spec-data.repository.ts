import { Inject, Injectable } from "@nestjs/common";
import { entitySource, entityWhere } from "../spec-read/entity-list.ts";
import { type Snapshot, SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import { loadWindow } from "../tracker/long-list.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  EntityRowData,
  GitSource,
  IndexFailure,
  ModelSource,
  SpecDataRepository,
  TableSource,
  TablesPage,
  TablesRequest,
} from "./spec-data.repository.ts";

const failureOf = (snapshot: Snapshot): IndexFailure => ({
  kind: "failed",
  errorCode: snapshot.errorCode ?? "unknown",
  commitSha: snapshot.commitSha,
});

type Found = NonNullable<Awaited<ReturnType<SpecHeadResolver["resolve"]>>>;

const rowOf = (row: { specId: string; path: string; data: unknown }): EntityRowData => ({
  specId: row.specId,
  path: row.path,
  data: row.data,
});

/** Lectures de l'index d'entités pour la page Données (TK-107) : une transaction courte par appel, aucun réseau. */
@Injectable()
export class PrismaSpecDataRepository implements SpecDataRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
    @Inject(FullTextSearch) private readonly search: FullTextSearch,
  ) {}

  /** Instantané lisible : `null` (rien d'indexé), échec d'indexation, ou l'instantané dont les entités sont indexées. */
  private async readable(tx: Tx, scope: ProjectScope, revision: Revision) {
    const found = await this.resolver.resolve(tx, scope, revision);
    const snapshot = found?.snapshot;
    if (!found || !snapshot) return null;
    if (snapshot.status === "failed") return failureOf(snapshot);
    return snapshot.entitiesIndexedAt === null ? null : { found, snapshot };
  }

  tablesPage(scope: ProjectScope, revision: Revision, request: TablesRequest) {
    const { zone, q, ...window } = request;
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { id: snapshotId } = readable.snapshot;
      const ids = q === undefined ? null : await this.search.entityIds(snapshotId, "table", q);
      const where = {
        ...entityWhere(snapshotId, "table", ids),
        ...(zone === undefined ? {} : { data: { path: ["zone"], equals: zone } }),
      };
      const { rows, ...position } = await loadWindow(
        entitySource(tx, snapshotId, "table", where),
        window,
      );
      const [counts, zones] = await Promise.all([
        this.search.tableRelationCounts(
          snapshotId,
          rows.map((row) => row.id),
        ),
        this.search.tableZoneFacets(snapshotId, ids),
      ]);
      const page: TablesPage = {
        items: rows.map((row) => ({
          specId: row.specId,
          path: row.path,
          data: row.data,
          relationCount: counts.get(row.id) ?? 0,
        })),
        ...position,
        facets: { zone: zones },
      };
      return { kind: "page" as const, page };
    });
  }

  /** Où lire git pour l'instantané lisible : commit, dossier de spec, dépôt, propriétaire et installation. */
  private async gitSource(tx: Tx, found: Found, snapshot: Snapshot): Promise<GitSource> {
    const installation = await tx.providerInstallation.findFirst({
      where: { id: found.repo.installationId },
    });
    return {
      commitSha: snapshot.commitSha,
      specPath: found.repo.specPath,
      repoName: found.repo.name,
      owner: { kind: installation?.ownerKind ?? "organization", login: found.repo.ownerLogin },
      installation: {
        id: installation?.id ?? "",
        externalId: installation?.externalId ?? "",
        active: installation?.status === "active",
      },
    };
  }

  headSource(scope: ProjectScope, revision: Revision) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { found, snapshot } = readable;
      return { kind: "found" as const, ...(await this.gitSource(tx, found, snapshot)) };
    });
  }

  modelSource(scope: ProjectScope, revision: Revision): Promise<IndexFailure | ModelSource | null> {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { found, snapshot } = readable;
      const tables = await tx.specEntity.findMany({
        where: { snapshotId: snapshot.id, kind: "table" },
        orderBy: [{ sort: "asc" }, { id: "asc" }],
        select: { data: true },
      });
      return {
        kind: "found" as const,
        ...(await this.gitSource(tx, found, snapshot)),
        tables: tables.map((row) => row.data),
      };
    });
  }

  tableSource(
    scope: ProjectScope,
    revision: Revision,
    specId: string,
  ): Promise<IndexFailure | TableSource | null> {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { found, snapshot } = readable;
      const row = await tx.specEntity.findFirst({
        where: { snapshotId: snapshot.id, kind: "table", specId },
        select: { specId: true, path: true, data: true },
      });
      if (!row) return null;
      return {
        kind: "found" as const,
        ...(await this.gitSource(tx, found, snapshot)),
        ...rowOf(row),
      };
    });
  }

  fixtures(scope: ProjectScope, revision: Revision) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const rows = await tx.specEntity.findMany({
        where: { snapshotId: readable.snapshot.id, kind: "fixture" },
        orderBy: [{ sort: "asc" }, { id: "asc" }],
        select: { specId: true, path: true, data: true },
      });
      return {
        kind: "found" as const,
        commitSha: readable.snapshot.commitSha,
        rows: rows.map(rowOf),
      };
    });
  }

  fixture(scope: ProjectScope, revision: Revision, specId: string) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const row = await tx.specEntity.findFirst({
        where: { snapshotId: readable.snapshot.id, kind: "fixture", specId },
        select: { specId: true, path: true, data: true },
      });
      return row
        ? { kind: "found" as const, commitSha: readable.snapshot.commitSha, ...rowOf(row) }
        : null;
    });
  }
}
