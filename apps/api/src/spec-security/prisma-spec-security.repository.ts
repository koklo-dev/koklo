import type { IncidentContact } from "@koklo/contract";
import type { Prisma } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { readableHead } from "../spec-architecture/readable-head.ts";
import type { IndexFailure } from "../spec-architecture/spec-architecture.repository.ts";
import { entitySource, entityWhere } from "../spec-read/entity-list.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import { loadWindow } from "../tracker/long-list.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  SecurityKind,
  SpecSecurityRepository,
  ThreatRequest,
} from "./spec-security.repository.ts";

type Where = Prisma.SpecEntityWhereInput;
type Readable = Exclude<Awaited<ReturnType<typeof readableHead>>, null | IndexFailure>;

const SELECT = { kind: true, specId: true, path: true, data: true } as const;
/** Un instantané est borné à quelques milliers de fichiers ; `data.yaml` à 5 000 entrées. */
const MAX_ROWS = 20_000;

const jsonEquals = (path: string[], value: Prisma.InputJsonValue): Where => ({
  data: { path, equals: value },
});
const THREAT_FILTERS: Readonly<Record<NonNullable<ThreatRequest["filter"]>, Where>> = {
  high: jsonEquals(["gravite"], "elevee"),
  todo: jsonEquals(["parades"], []),
  ci: jsonEquals(["verification", "mode"], "controle_ci"),
};

/** Lectures de l'index pour la page Sécurité (TK-117) : une transaction courte par appel, aucun réseau. */
@Injectable()
export class PrismaSpecSecurityRepository implements SpecSecurityRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
    @Inject(FullTextSearch) private readonly search: FullTextSearch,
  ) {}

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

  head(scope: ProjectScope, revision: Revision, kinds: readonly SecurityKind[]) {
    return this.read(scope, revision, async (tx, { snapshot }) => ({
      kind: "found" as const,
      commitSha: snapshot.commitSha,
      rows: await tx.specEntity.findMany({
        where: { snapshotId: snapshot.id, kind: { in: [...kinds] } },
        orderBy: [{ kind: "asc" }, { sort: "asc" }, { id: "asc" }],
        select: SELECT,
        take: MAX_ROWS,
      }),
    }));
  }

  threatPage(scope: ProjectScope, revision: Revision, { q, filter, ...window }: ThreatRequest) {
    return this.read(scope, revision, async (tx, { snapshot: { id } }) => {
      const ids = q === undefined ? null : await this.search.entityIds(id, "threat", q);
      const matched = entityWhere(id, "threat", ids);
      const where = filter === undefined ? matched : { AND: [matched, THREAT_FILTERS[filter]] };
      const { rows, ...position } = await loadWindow(entitySource(tx, id, "threat", where), window);
      const all = await tx.specEntity.findMany({
        where: entityWhere(id, "threat", null),
        orderBy: [{ sort: "asc" }, { id: "asc" }],
        select: SELECT,
        take: MAX_ROWS,
      });
      const items = rows.map((row) => ({ ...row, kind: "threat" }));
      return { kind: "page" as const, window: { ...position, rows: items }, all };
    });
  }

  async featureTitles(scope: ProjectScope, revision: Revision, ids: readonly string[]) {
    const found = await this.read(scope, revision, (tx, { snapshot }) =>
      tx.specFeature.findMany({
        where: { snapshotId: snapshot.id, specId: { in: [...ids] } },
        select: { specId: true, title: true },
        take: ids.length,
      }),
    );
    const rows = Array.isArray(found) ? found : [];
    return new Map(rows.map((row) => [row.specId, row.title]));
  }

  async projectName(scope: ProjectScope): Promise<string> {
    const project = await this.transactions.run(scope, (tx) =>
      tx.project.findFirst({ where: { id: scope.projectId }, select: { name: true } }),
    );
    return project?.name ?? "";
  }

  contact(scope: ProjectScope): Promise<IncidentContact | null> {
    return this.transactions.run(scope, (tx) =>
      tx.projectIncidentContact.findFirst({
        where: { projectId: scope.projectId },
        select: { name: true, phone: true },
      }),
    );
  }
}
