import type {
  SecurityAsvsReport,
  SecurityDataEntryDetail,
  SecurityDataListInput,
  SecurityRightsMatrix,
  SecuritySummaryCard,
  SecuritySummaryRead,
  ThreatDetail,
  ThreatListInput,
} from "@koklo/contract";
import { DATA_PAGE_SIZE, THREAT_PAGE_SIZE } from "@koklo/contract";
import { type RightsFile, type RolesFile, rgpdRegistry } from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { indexFailed } from "../spec-read/index-failed.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import { countValues } from "../spec-technical/technical-values.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import { loadWindow } from "../tracker/long-list.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { contextView, dataFacets, dataRows, dataSource, filteredRows } from "./data-values.ts";
import {
  asvsView,
  dataOf,
  entriesOf,
  featureSurfaces,
  type IndexRow,
  rightsView,
  summaryView,
  surfaceTitle,
  threatDetail,
  threatSummary,
} from "./security-values.ts";
import {
  type SecurityHead,
  type SecurityKind,
  SPEC_SECURITY_REPOSITORY,
  type SpecSecurityRepository,
} from "./spec-security.repository.ts";

type ListInput<T> = Omit<T, "projectId">;
const revisionOf = ({ branch, commitSha }: Revision): Revision => ({ branch, commitSha });
const DATA_KINDS = ["sensitive", "table", "environments", "stack"] as const;

const NO_THREATS = {
  items: [],
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: 0,
  facets: { status: { total: 0, todo: 0, todoHigh: 0, high: 0 }, surface: {} },
  surfaces: [],
};

function threatFacets(all: readonly IndexRow[]) {
  const threats = all.map(threatSummary);
  const high = threats.filter((threat) => threat.severity === "high");
  const todo = (list: typeof threats) => list.filter((threat) => threat.status === "todo").length;
  return {
    status: {
      total: threats.length,
      todo: todo(threats),
      todoHigh: todo(high),
      high: high.length,
    },
    surface: countValues(threats.map((threat) => threat.surface)),
  };
}

/**
 * Lectures de la page Sécurité (TK-117, B808) : tout vient de l'index d'entités de la tête ; aucun réseau. Les écritures
 * sont dans `SpecSecurityWritesService`.
 */
@Injectable()
export class SpecSecurityService {
  constructor(
    @Inject(SPEC_SECURITY_REPOSITORY) private readonly repository: SpecSecurityRepository,
  ) {}

  /** Entités de la révision ; `null` : rien d'indexé ; échec d'indexation : 409. */
  async rows(
    scope: ProjectScope,
    revision: Revision,
    kinds: readonly SecurityKind[],
  ): Promise<SecurityHead | null> {
    const found = await this.repository.head(scope, revisionOf(revision), kinds);
    if (found?.kind === "failed") throw indexFailed(found);
    return found;
  }

  async threats(scope: ProjectScope, input: ListInput<ThreatListInput>) {
    const { q, filter, cursor, around, limit } = input;
    const revision = revisionOf(input);
    const request = { q, filter, cursor, around, limit: limit ?? THREAT_PAGE_SIZE };
    const found = await this.repository.threatPage(scope, revision, request);
    if (found?.kind === "failed") throw indexFailed(found);
    if (found === null) return NO_THREATS;
    const { rows, ...position } = found.window;
    const facets = threatFacets(found.all);
    const surfaces = [...new Set(found.all.map((row) => threatSummary(row).surface))];
    const titles = await this.repository.featureTitles(scope, revision, surfaces);
    return {
      ...position,
      items: rows.map(threatSummary),
      facets,
      surfaces: surfaces.map((id) => ({ id, title: surfaceTitle(id, titles) })),
    };
  }

  /** Fiche d'une menace de la révision ; inconnue : 404. */
  async threat(scope: ProjectScope, revision: Revision, id: string): Promise<ThreatDetail> {
    const head = orNotFound(await this.rows(scope, revision, ["threat"]));
    const row = orNotFound(head.rows.find((entry) => entry.specId === id));
    const titles = await this.repository.featureTitles(
      scope,
      revisionOf(revision),
      featureSurfaces([row]),
    );
    return threatDetail(row, titles, head.commitSha);
  }

  /** Entrée de données désignée par son premier champ ; champ sans entrée propre : 404. */
  async entry(
    scope: ProjectScope,
    revision: Revision,
    field: string,
  ): Promise<SecurityDataEntryDetail> {
    const head = orNotFound(await this.rows(scope, revision, ["sensitive"]));
    const source = orNotFound(head.rows.find((row) => row.specId === field));
    const found = orNotFound(dataRows([source]).find((row) => row.field === field));
    return { ...found, filePath: source.path, commitSha: head.commitSha };
  }

  async data(scope: ProjectScope, input: ListInput<SecurityDataListInput>) {
    const { cursor, around, limit, q, category, undecided } = input;
    const head = await this.rows(scope, input, DATA_KINDS);
    const all = dataRows(head?.rows ?? []);
    const listed = filteredRows(all, { q, category, undecided });
    const window = await loadWindow(dataSource(listed, all), {
      limit: limit ?? DATA_PAGE_SIZE,
      cursor,
      around,
    });
    const { rows, ...position } = window;
    return {
      ...position,
      items: rows,
      facets: dataFacets(all),
      context: contextView(head?.rows ?? []),
    };
  }

  /** Registre des traitements en Markdown (B809). */
  async registry(scope: ProjectScope, revision: Revision) {
    const head = await this.rows(scope, revision, ["sensitive", "environments", "stack"]);
    const rows = head?.rows ?? [];
    const { hosting, subprocessors, transfers } = contextView(rows);
    const name = await this.repository.projectName(scope);
    return rgpdRegistry({
      projectName: name,
      projectSlug: name,
      data: { donnees: entriesOf(rows) },
      context: { hosting, subprocessors, transfers: transfers ?? undefined },
    });
  }

  async rights(scope: ProjectScope, revision: Revision): Promise<SecurityRightsMatrix> {
    const head = await this.rows(scope, revision, ["roles", "rights"]);
    const rows = head?.rows ?? [];
    return {
      ...rightsView(dataOf<RolesFile>(rows, "roles"), dataOf<RightsFile>(rows, "rights")),
      commitSha: head?.commitSha ?? null,
    };
  }

  async asvs(scope: ProjectScope, revision: Revision): Promise<SecurityAsvsReport> {
    const head = await this.rows(scope, revision, ["asvs", "sensitive"]);
    const rows = head?.rows ?? [];
    return {
      ...asvsView(dataOf(rows, "asvs"), entriesOf(rows)),
      commitSha: head?.commitSha ?? null,
    };
  }

  /** Cartes du résumé à la tête ; vide sans résumé indexé. */
  async cards(
    scope: ProjectScope,
    revision: Revision = {},
  ): Promise<{ cards: SecuritySummaryCard[]; commitSha: string | null }> {
    const head = await this.rows(scope, revision, ["security_summary", "sensitive"]);
    return { cards: summaryView(head?.rows ?? []), commitSha: head?.commitSha ?? null };
  }

  /** Résumé vu de l'équipe, avec le contact saisi par le client (B801). */
  async summary(scope: ProjectScope, revision: Revision): Promise<SecuritySummaryRead> {
    const { cards, commitSha } = await this.cards(scope, revision);
    const contact = await this.repository.contact(scope);
    return {
      available: cards.length > 0,
      cards,
      commitSha,
      ...(contact === null ? {} : { contact }),
    };
  }

  contact(scope: ProjectScope) {
    return this.repository.contact(scope);
  }
}
