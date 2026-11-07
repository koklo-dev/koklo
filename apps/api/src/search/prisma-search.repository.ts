import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { FullTextSearch } from "../tracker/full-text-search.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type {
  SearchHit,
  SearchOutcome,
  SearchRepository,
  SearchRequest,
} from "./search.repository.ts";

/** Une section de résultats : son total réel et, tant qu'il reste de la place, ses premières lignes. */
interface Section {
  total: number;
  hits: SearchHit[];
}

const EMPTY: Section = { total: 0, hits: [] };

/** Compte toujours ; ne lit des lignes que s'il reste de la place et qu'il y en a. */
async function section(
  room: number,
  count: () => Promise<number>,
  rows: (take: number) => Promise<SearchHit[]>,
): Promise<Section> {
  const total = await count();
  return { total, hits: room > 0 && total > 0 ? await rows(room) : [] };
}

/** Échappe les jokers `LIKE` : la saisie est du texte, jamais un motif. */
const literal = (text: string): string => text.replace(/[\\%_]/g, "\\$&");

@Injectable()
export class PrismaSearchRepository implements SearchRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
    @Inject(FullTextSearch) private readonly fullText: FullTextSearch,
  ) {}

  search(request: SearchRequest): Promise<SearchOutcome> {
    return withOrganization(request.organizationId, () =>
      this.database.client.$transaction(async (tx) => {
        const projects = await this.projects(tx, request, request.limit);
        const features = await this.features(tx, request, request.limit - projects.hits.length);
        const used = projects.hits.length + features.hits.length;
        const tickets = await this.tickets(tx, request, request.limit - used);
        return {
          items: [...projects.hits, ...features.hits, ...tickets.hits],
          total: projects.total + features.total + tickets.total,
        };
      }),
    );
  }

  private projects(tx: Tx, request: SearchRequest, room: number): Promise<Section> {
    const where = {
      name: { contains: literal(request.q), mode: "insensitive" as const },
      ...(request.linkedProjectIds ? { id: { in: [...request.linkedProjectIds] } } : {}),
    };
    return section(
      room,
      () => tx.project.count({ where }),
      async (take) => {
        const rows = await tx.project.findMany({
          where,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take,
          select: { id: true, name: true },
        });
        return rows.map((row) => ({ kind: "project" as const, ...row }));
      },
    );
  }

  private async features(tx: Tx, request: SearchRequest, room: number): Promise<Section> {
    const { projectId, includeFeatures, q } = request;
    if (!projectId || !includeFeatures) return EMPTY;
    const scope = { organizationId: request.organizationId, userId: request.userId, projectId };
    const found = await this.resolver.resolve(tx, scope, {});
    if (!found) return EMPTY;
    const ids = await this.fullText.ids("specFeature", found.snapshot.id, q);
    const where = {
      snapshotId: found.snapshot.id,
      OR: [{ id: { in: ids } }, { specId: { equals: q, mode: "insensitive" as const } }],
    };
    return section(
      room,
      () => tx.specFeature.count({ where }),
      async (take) => {
        const rows = await tx.specFeature.findMany({
          where,
          orderBy: [{ specNumber: "asc" }, { id: "asc" }],
          take,
          select: { specId: true, title: true },
        });
        return rows.map((row) => ({ kind: "feature" as const, projectId, ...row }));
      },
    );
  }

  private async tickets(tx: Tx, request: SearchRequest, room: number): Promise<Section> {
    const { projectId, q } = request;
    if (!projectId) return EMPTY;
    const ids = await this.fullText.ids("ticket", projectId, q);
    const where = {
      projectId,
      deletedAt: null,
      OR: [{ id: { in: ids } }, { key: { equals: q, mode: "insensitive" as const } }],
    };
    return section(
      room,
      () => tx.ticket.count({ where }),
      async (take) => {
        const rows = await tx.ticket.findMany({
          where,
          orderBy: [{ keyNumber: "asc" }, { id: "asc" }],
          take,
          select: { key: true, title: true, status: true },
        });
        return rows.map((row) => ({ kind: "ticket" as const, projectId, ...row }));
      },
    );
  }
}
