import type { SpecHeadOutput, SpecItem } from "@koklo/contract";
import { SPEC_REFS_MAX } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import { loadWindow } from "../tracker/long-list.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  featureFacets,
  featureSelect,
  featureSource,
  featureWhere,
  toSummary,
} from "./feature-list.ts";
import { type Snapshot, SpecHeadResolver } from "./spec-head-resolver.ts";
import type {
  EntityReference,
  FeatureListRequest,
  FeatureSource,
  IndexedFeaturePage,
  IndexedFeatures,
  RefHit,
  Revision,
  SpecReadRepository,
} from "./spec-read.repository.ts";

/** Échec d'indexation tel que stocké ; un code absent (jamais écrit par le worker) devient `unknown`. */
const failureOf = (snapshot: Snapshot) =>
  ({
    kind: "failed",
    errorCode: snapshot.errorCode ?? "unknown",
    commitSha: snapshot.commitSha,
  }) as const;

@Injectable()
export class PrismaSpecReadRepository implements SpecReadRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
    @Inject(FullTextSearch) private readonly search: FullTextSearch,
  ) {}

  head(scope: ProjectScope, revision: Revision): Promise<SpecHeadOutput> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, revision);
      if (!found) return null;
      const where = { snapshotId: found.snapshot.id };
      const [features, tables, endpoints] = await Promise.all([
        tx.specFeature.count({ where }),
        tx.specTable.count({ where }),
        tx.specEndpoint.count({ where }),
      ]);
      return {
        branch: found.branch,
        commitSha: found.snapshot.commitSha,
        status: found.snapshot.status,
        errorCode: found.snapshot.errorCode,
        indexedAt: found.snapshot.indexedAt.toISOString(),
        counts: { features, tables, endpoints },
      };
    });
  }

  featuresPage(
    scope: ProjectScope,
    revision: Revision,
    { filter, q, ...request }: FeatureListRequest,
  ): Promise<IndexedFeaturePage | null> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, revision);
      if (!found) return null;
      const { snapshot } = found;
      if (snapshot.status === "failed") return failureOf(snapshot);
      const ids = q === undefined ? null : await this.search.ids("specFeature", snapshot.id, q);
      const source = featureSource(tx, snapshot.id, featureWhere(snapshot.id, filter, ids));
      const window = await loadWindow(source, request);
      const facets = await featureFacets(tx, snapshot.id, filter, ids);
      const { rows, ...position } = window;
      return { kind: "page", page: { items: rows.map(toSummary), ...position, facets } };
    });
  }

  features(scope: ProjectScope, revision: Revision): Promise<IndexedFeatures | null> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, revision);
      if (!found) return null;
      const { snapshot } = found;
      if (snapshot.status === "failed") {
        return failureOf(snapshot);
      }
      const rows = await tx.specFeature.findMany({
        where: { snapshotId: snapshot.id },
        select: featureSelect,
      });
      return { kind: "rows", rows: rows.map(toSummary) };
    });
  }

  featureSource(scope: ProjectScope, specId: string): Promise<FeatureSource | null> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, {});
      if (!found) return null;
      const { repo, snapshot } = found;
      if (snapshot.status === "failed") {
        return failureOf(snapshot);
      }
      const feature = await tx.specFeature.findFirst({
        where: { snapshotId: snapshot.id, specId },
        select: { filePath: true },
      });
      const installation = await tx.providerInstallation.findFirst({
        where: { id: repo.installationId },
      });
      if (!feature || !installation) return null;
      return {
        kind: "found",
        commitSha: snapshot.commitSha,
        filePath: feature.filePath,
        specPath: repo.specPath,
        repoName: repo.name,
        owner: { kind: installation.ownerKind, login: repo.ownerLogin },
        installation: {
          id: installation.id,
          externalId: installation.externalId,
          active: installation.status === "active",
        },
      };
    });
  }

  /** Instantané de tête dont les entités sont indexées et lisibles, sinon `null` (pas de dépôt, échec, jamais indexé). */
  private entitySnapshot(tx: Tx, scope: ProjectScope): Promise<string | null> {
    return this.resolver.resolve(tx, scope, {}).then((found) => {
      const snapshot = found?.snapshot;
      return snapshot && snapshot.status !== "failed" && snapshot.entitiesIndexedAt !== null
        ? snapshot.id
        : null;
    });
  }

  searchRefs(scope: ProjectScope, kinds: readonly RefHit["kind"][], q: string): Promise<RefHit[]> {
    return this.transactions.run(scope, async (tx) => {
      const snapshotId = await this.entitySnapshot(tx, scope);
      if (snapshotId === null) return [];
      const rows = await this.search.refs(snapshotId, kinds, q, SPEC_REFS_MAX);
      return rows as RefHit[];
    });
  }

  referencedBy(scope: ProjectScope, specId: string): Promise<SpecItem["referencedBy"]> {
    return this.transactions.run(scope, async (tx) => {
      const snapshotId = await this.entitySnapshot(tx, scope);
      if (snapshotId === null) return { items: [], total: 0 };
      const found = await this.search.referencing(snapshotId, specId, SPEC_REFS_MAX);
      return { items: found.items as EntityReference[], total: found.total };
    });
  }
}
