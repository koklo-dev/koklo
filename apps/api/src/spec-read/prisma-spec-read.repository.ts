import type { SpecHeadOutput, SpecItem } from "@koklo/contract";
import { SPEC_REFS_MAX } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import { loadWindow } from "../tracker/long-list.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { entitySource, entityWhere, ruleTypeFacets } from "./entity-list.ts";
import { functionalItemOf } from "./entity-values.ts";
import {
  featureFacets,
  featureSelect,
  featureSource,
  featureWhere,
  toHead,
} from "./feature-list.ts";
import { readFeatureValidations, validationOfFeature } from "./feature-validation.ts";
import { type Snapshot, SpecHeadResolver } from "./spec-head-resolver.ts";
import type {
  EntityItem,
  EntityReference,
  FeatureListRequest,
  FeatureSource,
  FunctionalListRequest,
  FunctionalPage,
  IndexedFeaturePage,
  IndexedFeatures,
  IndexedFunctionalPage,
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
      const [features, tables, endpoints, rules, flows, fixtures, relations, rolesFile] =
        await Promise.all([
          tx.specFeature.count({ where }),
          tx.specTable.count({ where }),
          tx.specEndpoint.count({ where }),
          tx.specEntity.count({ where: { ...where, kind: "rule" } }),
          tx.specEntity.count({ where: { ...where, kind: "flow" } }),
          tx.specEntity.count({ where: { ...where, kind: "fixture" } }),
          this.search.tableRelationTotal(found.snapshot.id),
          tx.specEntity.findFirst({ where: { ...where, kind: "roles" }, select: { data: true } }),
        ]);
      const roleList = (rolesFile?.data as { roles?: unknown } | null)?.roles;
      return {
        branch: found.branch,
        commitSha: found.snapshot.commitSha,
        status: found.snapshot.status,
        errorCode: found.snapshot.errorCode,
        indexedAt: found.snapshot.indexedAt.toISOString(),
        counts: {
          features,
          tables,
          endpoints,
          rules,
          roles: Array.isArray(roleList) ? roleList.length : 0,
          flows,
          relations,
          fixtures,
        },
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
      const validations = await readFeatureValidations(tx, scope.projectId, snapshot);
      const where = featureWhere(snapshot.id, filter, ids, validations);
      const window = await loadWindow(featureSource(tx, snapshot.id, where), request);
      const facets = await featureFacets(tx, snapshot.id, filter, ids, validations);
      const { rows, ...position } = window;
      const items = rows.map((row) => ({
        ...toHead(row),
        validation: validationOfFeature(validations, row.specId),
      }));
      return { kind: "page", page: { items, ...position, facets } };
    });
  }

  functionalPage(
    scope: ProjectScope,
    revision: Revision,
    { tab, type, q, ...request }: FunctionalListRequest,
  ): Promise<IndexedFunctionalPage | null> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, revision);
      if (!found) return null;
      const { snapshot } = found;
      if (snapshot.status === "failed") return failureOf(snapshot);
      const kind = tab === "rules" ? "rule" : "flow";
      const ids = q === undefined ? null : await this.search.entityIds(snapshot.id, kind, q);
      const where = entityWhere(snapshot.id, kind, ids, kind === "rule" ? type : undefined);
      const { rows, ...position } = await loadWindow(
        entitySource(tx, snapshot.id, kind, where),
        request,
      );
      const facets: FunctionalPage["facets"] =
        kind === "rule" ? { type: await ruleTypeFacets(tx, snapshot.id, ids) } : {};
      return {
        kind: "page",
        page: { items: rows.map((row) => functionalItemOf(kind, row)), ...position, facets },
      };
    });
  }

  entityItem(
    scope: ProjectScope,
    kind: "rule" | "flow" | "roles" | "table",
    specId: string,
    revision: Revision = {},
  ): Promise<EntityItem | null> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, revision);
      const snapshot = found?.snapshot;
      if (!snapshot) return null;
      if (snapshot.status === "failed") return failureOf(snapshot);
      if (snapshot.entitiesIndexedAt === null) return null;
      const row = await tx.specEntity.findFirst({
        where: { snapshotId: snapshot.id, kind, specId },
        select: { path: true, data: true },
      });
      return row ? { kind: "found", commitSha: snapshot.commitSha, ...row } : null;
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
      return { kind: "rows", rows: rows.map(toHead) };
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
