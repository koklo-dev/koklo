import { CONTRACT_STACK_ID } from "@koklo/contract";
import type { Prisma } from "@koklo/db";
import { TECHNICAL_PROPOSAL_VOCABULARY } from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { gitSourceOf, readableHead } from "../spec-architecture/readable-head.ts";
import type {
  ComponentRow,
  IndexFailure,
} from "../spec-architecture/spec-architecture.repository.ts";
import { type EntityKind, entitySource, entityWhere } from "../spec-read/entity-list.ts";
import { text } from "../spec-read/entity-values.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import { loadWindow } from "../tracker/long-list.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { OPERATIONS_ONLY } from "./operation-where.ts";
import type {
  NfrRequest,
  OperationRequest,
  SpecTechnicalApiRepository,
} from "./spec-technical-api.repository.ts";
import { countValues, englishOf, record } from "./technical-values.ts";

type Readable = Exclude<Awaited<ReturnType<typeof readableHead>>, null | IndexFailure>;

const SELECT = { specId: true, path: true, data: true } as const;
type Where = Prisma.SpecEntityWhereInput;

const rowOf = ({ specId, path, data }: ComponentRow): ComponentRow => ({ specId, path, data });
const dataEquals = (field: string, value: string): Where => ({
  data: { path: [field], equals: value },
});

const zoneOf = (data: unknown) => text(record(data).zone);
const byName = (a: string, b: string) => a.localeCompare(b, "fr");
const CATEGORIES = Object.keys(TECHNICAL_PROPOSAL_VOCABULARY.category);
const byRank = (a: string, b: string) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b);
const categoryOf = (data: unknown) =>
  englishOf(TECHNICAL_PROPOSAL_VOCABULARY.category, record(data).categorie, "operations");

/** Lectures de l'index pour les onglets API et Exigences (TK-116) : une transaction courte par appel, aucun réseau. */
@Injectable()
export class PrismaSpecTechnicalApiRepository implements SpecTechnicalApiRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
    @Inject(FullTextSearch) private readonly search: FullTextSearch,
  ) {}

  /** `work` sur l'instantané lisible de la révision ; rien d'indexé ou échec d'indexation : rendus tels quels. */
  private read<T>(
    scope: ProjectScope,
    revision: Revision,
    work: (tx: Tx, readable: Readable) => Promise<T>,
  ) {
    return this.transactions.run(scope, async (tx) => {
      const readable = await readableHead(this.resolver, tx, scope, revision);
      if (readable === null || "kind" in readable) return readable;
      return work(tx, readable);
    });
  }

  private async page(
    tx: Tx,
    snapshotId: string,
    kind: EntityKind,
    where: Where,
    window: { limit: number; cursor?: string; around?: string },
  ) {
    const source = entitySource(tx, snapshotId, kind, where);
    const { rows, ...position } = await loadWindow(source, window);
    return { ...position, items: rows.map(rowOf) };
  }

  /** Données de l'entité des rôles de l'instantané, `null` sans fichier. */
  private async rolesOf(tx: Tx, snapshotId: string): Promise<unknown> {
    const row = await tx.specEntity.findFirst({
      where: { snapshotId, kind: "roles" },
      select: { data: true },
    });
    return row?.data ?? null;
  }

  operationPage(scope: ProjectScope, revision: Revision, { zone, q, ...window }: OperationRequest) {
    return this.read(scope, revision, async (tx, readable) => {
      const { id } = readable.snapshot;
      const ids = q === undefined ? null : await this.search.entityIds(id, "endpoint", q);
      const matched = entityWhere(id, "endpoint", ids);
      const filters = zone === undefined ? [] : [dataEquals("zone", zone)];
      const where = { ...matched, AND: [...OPERATIONS_ONLY, ...filters] };
      const page = await this.page(tx, id, "endpoint", where, window);
      const all = await tx.specEntity.findMany({
        where: { ...matched, AND: OPERATIONS_ONLY },
        select: { data: true },
      });
      const zones = all.map((entry) => zoneOf(entry.data));
      const facets = { zone: countValues(zones, byName) };
      return { kind: "page" as const, page: { ...page, facets } };
    });
  }

  nfrPage(scope: ProjectScope, revision: Revision, { category, ...window }: NfrRequest) {
    return this.read(scope, revision, async (tx, readable) => {
      const { id } = readable.snapshot;
      const all = entityWhere(id, "nfr", null);
      const stored =
        category === undefined ? undefined : TECHNICAL_PROPOSAL_VOCABULARY.category[category];
      const where = stored === undefined ? all : { ...all, ...dataEquals("categorie", stored) };
      const page = await this.page(tx, id, "nfr", where, window);
      const rows = await tx.specEntity.findMany({ where: all, select: { data: true } });
      const categories = rows.map((entry) => categoryOf(entry.data));
      const facets = { category: countValues(categories, byRank) };
      return { kind: "page" as const, page: { ...page, facets } };
    });
  }

  operation(scope: ProjectScope, revision: Revision, id: string) {
    return this.read(scope, revision, async (tx, readable) => {
      const { found, snapshot } = readable;
      const entity = (kind: EntityKind, specId: string, AND: Where[] = []) =>
        tx.specEntity.findFirst({
          where: { snapshotId: snapshot.id, kind, specId, AND },
          select: SELECT,
        });
      const row = await entity("endpoint", id, OPERATIONS_ONLY);
      if (!row) return null;
      return {
        kind: "found" as const,
        row: rowOf(row),
        roles: await this.rolesOf(tx, snapshot.id),
        contractStack: await entity("stack", CONTRACT_STACK_ID),
        source: await gitSourceOf(tx, found, snapshot),
      };
    });
  }

  options(scope: ProjectScope, revision: Revision) {
    return this.read(scope, revision, async (tx, readable) => {
      const snapshotId = readable.snapshot.id;
      const zoned = await tx.specEntity.findMany({
        where: {
          snapshotId,
          OR: [{ kind: "component" }, { kind: "endpoint", AND: OPERATIONS_ONLY }],
        },
        select: { data: true },
      });
      return {
        kind: "found" as const,
        zoned: zoned.map((entry) => entry.data),
        roles: await this.rolesOf(tx, snapshotId),
      };
    });
  }

  nfr(scope: ProjectScope, revision: Revision, id: string) {
    return this.read(scope, revision, async (tx, readable) => {
      const { id: snapshotId, commitSha } = readable.snapshot;
      const row = await tx.specEntity.findFirst({
        where: { snapshotId, kind: "nfr", specId: id },
        select: SELECT,
      });
      return row ? { kind: "found" as const, row: rowOf(row), commitSha } : null;
    });
  }
}
