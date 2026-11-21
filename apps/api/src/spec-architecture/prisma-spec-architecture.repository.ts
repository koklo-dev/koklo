import type { Prisma } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { entitySource, entityWhere } from "../spec-read/entity-list.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import { loadWindow } from "../tracker/long-list.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { adrFilter, supersededByOfData } from "./architecture-adrs.ts";
import { gitSourceOf, readableHead } from "./readable-head.ts";
import type {
  AdrFound,
  AdrsRequest,
  ChecksFacts,
  ComponentsPage,
  ComponentsRequest,
  IndexFailure,
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

  adrsPage(scope: ProjectScope, revision: Revision, request: AdrsRequest) {
    const { q, status, component, from, to, ...window } = request;
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { id: snapshotId } = readable.snapshot;
      const ids = q === undefined ? null : await this.search.entityIds(snapshotId, "adr", q);
      const cited =
        component === undefined ? [] : await this.decisionsOf(tx, snapshotId, component);
      const base = adrFilter({ component, from, to }, cited);
      const where = {
        ...entityWhere(snapshotId, "adr", ids),
        AND: [...base, ...adrFilter({ status })],
      };
      const { rows, ...position } = await loadWindow(
        entitySource(tx, snapshotId, "adr", where),
        window,
      );
      const page: ComponentsPage = {
        items: rows.map(({ specId, path, data }) => ({ specId, path, data })),
        ...position,
        facets: {
          status: await this.statusFacets(tx, {
            ...entityWhere(snapshotId, "adr", ids),
            AND: base,
          }),
        },
      };
      return { kind: "page" as const, page };
    });
  }

  /** Décisions que le composant cite dans ses `decisions` (l'autre sens du lien, B580). */
  private async decisionsOf(tx: Tx, snapshotId: string, component: string): Promise<string[]> {
    const row = await tx.specEntity.findFirst({
      where: { snapshotId, kind: "component", specId: component },
      select: { data: true },
    });
    const decisions = (row?.data as { decisions?: unknown } | null)?.decisions;
    return Array.isArray(decisions)
      ? decisions.filter((id): id is string => typeof id === "string" && /^ADR-\d{3,}$/.test(id))
      : [];
  }

  /** Décisions par statut, sans tenir compte du filtre de statut (les compteurs de la barre de filtres restent justes). */
  private async statusFacets(tx: Tx, where: Prisma.SpecEntityWhereInput) {
    const rows = await tx.specEntity.findMany({ where, select: { data: true } });
    const counts = new Map<string, number>();
    for (const { data } of rows) {
      const status = (data as { statut?: unknown } | null)?.statut;
      if (typeof status === "string") counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  adr(scope: ProjectScope, revision: Revision, adrId: string) {
    return this.transactions.run(scope, async (tx): Promise<IndexFailure | AdrFound | null> => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { id: snapshotId, commitSha } = readable.snapshot;
      const select = { specId: true, path: true, data: true } as const;
      const adr = await tx.specEntity.findFirst({
        where: { snapshotId, kind: "adr", specId: adrId },
        select,
      });
      if (!adr) return null;
      const by = supersededByOfData(adr.data);
      const replacedBy =
        by === undefined
          ? null
          : await tx.specEntity.findFirst({
              where: { snapshotId, kind: "adr", specId: by },
              select,
            });
      return { kind: "found", adr, replacedBy, commitSha };
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
