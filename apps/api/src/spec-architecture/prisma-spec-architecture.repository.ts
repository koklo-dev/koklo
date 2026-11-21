import { Inject, Injectable } from "@nestjs/common";
import { entitySource, entityWhere } from "../spec-read/entity-list.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import { loadWindow } from "../tracker/long-list.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { gitSourceOf, readableHead } from "./readable-head.ts";
import type {
  ChecksFacts,
  ComponentsPage,
  ComponentsRequest,
  SpecArchitectureRepository,
} from "./spec-architecture.repository.ts";

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

  private readable(tx: Tx, scope: ProjectScope, revision: Revision) {
    return readableHead(this.resolver, tx, scope, revision);
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

  headSource(scope: ProjectScope, revision: Revision) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { found, snapshot } = readable;
      return { kind: "found" as const, ...(await gitSourceOf(tx, found, snapshot)) };
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
