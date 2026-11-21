import { Inject, Injectable } from "@nestjs/common";
import { entitySource, entityWhere } from "../spec-read/entity-list.ts";
import { isRecord, list, text } from "../spec-read/entity-values.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import { loadWindow } from "../tracker/long-list.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { gitSourceOf, readableHead } from "./readable-head.ts";
import type {
  ComponentFound,
  DiagramModel,
  EntityData,
  FlowFound,
  FlowsPage,
  FlowsRequest,
  SpecArchitectureDiagramRepository,
} from "./spec-architecture-diagram.repository.ts";

const select = { specId: true, path: true, data: true } as const;
const rowOf = (row: EntityData): EntityData => ({
  specId: row.specId,
  path: row.path,
  data: row.data,
});

/** Participants cités par les flux (identifiants `C-` seulement : les rôles viennent de `roles`). */
const componentIdsOf = (rows: readonly EntityData[]): string[] => [
  ...new Set(
    rows.flatMap(({ data }) =>
      list(isRecord(data) ? data.participants : undefined)
        .map(text)
        .filter((id) => id.startsWith("C-")),
    ),
  ),
];

/** Lectures de l'index d'entités pour le schéma et les flux (TK-112) : une transaction courte par appel, aucun réseau. */
@Injectable()
export class PrismaSpecArchitectureDiagramRepository implements SpecArchitectureDiagramRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
    @Inject(FullTextSearch) private readonly search: FullTextSearch,
  ) {}

  private readable(tx: Tx, scope: ProjectScope, revision: Revision) {
    return readableHead(this.resolver, tx, scope, revision);
  }

  private async rolesOf(tx: Tx, snapshotId: string): Promise<unknown> {
    const row = await tx.specEntity.findFirst({
      where: { snapshotId, kind: "roles", specId: "roles" },
      select: { data: true },
    });
    return row?.data ?? null;
  }

  private async entities(tx: Tx, snapshotId: string, kind: string, specIds?: readonly string[]) {
    const rows = await tx.specEntity.findMany({
      where: { snapshotId, kind, ...(specIds ? { specId: { in: [...specIds] } } : {}) },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      select,
    });
    return rows.map(rowOf);
  }

  model(scope: ProjectScope, revision: Revision) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { found, snapshot } = readable;
      const model: DiagramModel = {
        kind: "found",
        ...(await gitSourceOf(tx, found, snapshot)),
        components: await this.entities(tx, snapshot.id, "component"),
        flows: await this.entities(tx, snapshot.id, "archflow"),
        roles: await this.rolesOf(tx, snapshot.id),
      };
      return model;
    });
  }

  headSource(scope: ProjectScope, revision: Revision) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { found, snapshot } = readable;
      return { kind: "found" as const, ...(await gitSourceOf(tx, found, snapshot)) };
    });
  }

  searchComponents(scope: ProjectScope, revision: Revision, q: string, limit: number) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { id: snapshotId } = readable.snapshot;
      const ids = await this.search.entityIds(snapshotId, "component", q);
      const rows =
        ids.length === 0
          ? []
          : await tx.specEntity.findMany({
              where: entityWhere(snapshotId, "component", ids),
              orderBy: [{ sort: "asc" }, { id: "asc" }],
              select,
              take: limit,
            });
      return { kind: "found" as const, rows: rows.map(rowOf) };
    });
  }

  /**
   * Filtre des flux : sans recherche, tous ; avec, ceux dont l'identifiant ou le titre d'index correspond, plus ceux dont le
   * parcours `P-` du même identifiant correspond (le titre lisible est celui du parcours).
   */
  private async flowWhere(tx: Tx, snapshotId: string, q: string | undefined) {
    if (q === undefined) return entityWhere(snapshotId, "archflow", null);
    const [own, titled] = await Promise.all([
      this.search.entityIds(snapshotId, "archflow", q),
      this.search.entityIds(snapshotId, "flow", q),
    ]);
    const parcours =
      titled.length === 0
        ? []
        : await tx.specEntity.findMany({
            where: { snapshotId, kind: "flow", id: { in: titled } },
            select: { specId: true },
          });
    return {
      snapshotId,
      kind: "archflow",
      OR: [{ id: { in: own } }, { specId: { in: parcours.map((row) => row.specId) } }],
    };
  }

  flowsPage(scope: ProjectScope, revision: Revision, request: FlowsRequest) {
    const { q, ...window } = request;
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { id: snapshotId } = readable.snapshot;
      const where = await this.flowWhere(tx, snapshotId, q);
      const { rows, ...position } = await loadWindow(
        entitySource(tx, snapshotId, "archflow", where),
        window,
      );
      const items = rows.map(rowOf);
      const page: FlowsPage = {
        items,
        ...position,
        parcours: await this.entities(
          tx,
          snapshotId,
          "flow",
          items.map((row) => row.specId),
        ),
        components: await this.entities(tx, snapshotId, "component", componentIdsOf(items)),
        roles: await this.rolesOf(tx, snapshotId),
      };
      return { kind: "page" as const, page };
    });
  }

  flow(scope: ProjectScope, revision: Revision, flowId: string) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { found, snapshot } = readable;
      const row = await tx.specEntity.findFirst({
        where: { snapshotId: snapshot.id, kind: "archflow", specId: flowId },
        select,
      });
      if (!row) return null;
      const [parcours] = await this.entities(tx, snapshot.id, "flow", [flowId]);
      const result: FlowFound = {
        kind: "found",
        ...(await gitSourceOf(tx, found, snapshot)),
        flow: rowOf(row),
        parcours: parcours ?? null,
        components: await this.entities(tx, snapshot.id, "component", componentIdsOf([rowOf(row)])),
        roles: await this.rolesOf(tx, snapshot.id),
      };
      return result;
    });
  }

  component(scope: ProjectScope, revision: Revision, componentId: string) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await this.readable(tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      const { found, snapshot } = readable;
      const row = await tx.specEntity.findFirst({
        where: { snapshotId: snapshot.id, kind: "component", specId: componentId },
        select,
      });
      if (!row) return null;
      const result: ComponentFound = {
        kind: "found",
        ...(await gitSourceOf(tx, found, snapshot)),
        component: rowOf(row),
      };
      return result;
    });
  }
}
