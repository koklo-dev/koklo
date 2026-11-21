import { Inject, Injectable } from "@nestjs/common";
import { entitySource, entityWhere } from "../spec-read/entity-list.ts";
import { type Snapshot, SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import { loadWindow } from "../tracker/long-list.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  ChecksFacts,
  ComponentsPage,
  ComponentsRequest,
  GitSource,
  IndexFailure,
  SpecArchitectureRepository,
} from "./spec-architecture.repository.ts";

const failureOf = (snapshot: Snapshot): IndexFailure => ({
  kind: "failed",
  errorCode: snapshot.errorCode ?? "unknown",
  commitSha: snapshot.commitSha,
});

type Found = NonNullable<Awaited<ReturnType<SpecHeadResolver["resolve"]>>>;

const zoneOf = (data: unknown): string | undefined => {
  const zone = (data as { zone?: unknown } | null)?.zone;
  return typeof zone === "string" && zone !== "" ? zone : undefined;
};

/** Lectures de l'index d'entités pour la page Architecture (TK-111) : une transaction courte par appel, aucun réseau. */
@Injectable()
export class PrismaSpecArchitectureRepository implements SpecArchitectureRepository {
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

  componentsPage(scope: ProjectScope, revision: Revision, request: ComponentsRequest) {
    const { zone, q, ...window } = request;
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { id: snapshotId } = readable.snapshot;
      const ids = q === undefined ? null : await this.search.entityIds(snapshotId, "component", q);
      const where = {
        ...entityWhere(snapshotId, "component", ids),
        ...(zone === undefined ? {} : { data: { path: ["zone"], equals: zone } }),
      };
      const { rows, ...position } = await loadWindow(
        entitySource(tx, snapshotId, "component", where),
        window,
      );
      const page: ComponentsPage = {
        items: rows.map(({ specId, path, data }) => ({ specId, path, data })),
        ...position,
        facets: { zone: await this.zoneFacets(tx, snapshotId, ids) },
      };
      return { kind: "page" as const, page };
    });
  }

  /** Composants par zone, sans tenir compte du filtre de zone (les compteurs de la barre de filtres restent justes). */
  private async zoneFacets(tx: Tx, snapshotId: string, ids: readonly string[] | null) {
    const rows = await tx.specEntity.findMany({
      where: entityWhere(snapshotId, "component", ids),
      select: { data: true },
    });
    const zones = new Map<string, number>();
    for (const { data } of rows) {
      const zone = zoneOf(data);
      if (zone !== undefined) zones.set(zone, (zones.get(zone) ?? 0) + 1);
    }
    return Object.fromEntries([...zones].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  /** Où lire git pour l'instantané lisible. */
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

  checkFacts(scope: ProjectScope) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, {});
      if (readable === null || "kind" in readable) return readable;
      const { id: snapshotId } = readable.snapshot;
      const entities = await tx.specEntity.findMany({
        where: { snapshotId, kind: { in: ["feature", "table", "flow", "component", "archflow"] } },
        orderBy: [{ kind: "asc" }, { sort: "asc" }, { id: "asc" }],
        select: { kind: true, specId: true, data: true },
      });
      const idsOf = (kind: string) =>
        entities.filter((row) => row.kind === kind).map((row) => row.specId);
      const facts: ChecksFacts = {
        features: idsOf("feature"),
        tables: idsOf("table"),
        flows: idsOf("flow"),
        components: entities
          .filter((row) => row.kind === "component")
          .map(({ specId, data }) => ({ specId, data })),
        archflows: idsOf("archflow"),
        pending: await this.pendingProposals(tx, scope),
      };
      return { kind: "found" as const, facts };
    });
  }

  /** Propositions `component` et `archflow` en attente du dernier lancement de l'architecture (celui que l'on relit). */
  private async pendingProposals(tx: Tx, scope: ProjectScope) {
    const launch = await tx.agentLaunch.findFirst({
      where: { projectId: scope.projectId, deliverable: "architecture" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (launch === null) return [];
    const rows = await tx.agentProposal.findMany({
      where: { launchId: launch.id, status: "pending", kind: { in: ["component", "archflow"] } },
      select: { kind: true, payload: true },
    });
    return rows.map(({ kind, payload }) => ({ kind: String(kind), payload }));
  }
}
