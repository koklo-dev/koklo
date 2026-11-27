import type {
  ArchitectureSource,
  NfrDetail,
  NfrListInput,
  NfrSummary,
  OperationDetail,
  OperationListInput,
  OperationOptions,
  OperationSummary,
  TechnicalContract,
} from "@koklo/contract";
import { NFR_PAGE_SIZE, OPERATION_PAGE_SIZE } from "@koklo/contract";
import type { GitReadCache } from "@koklo/github";
import { Inject, Injectable } from "@nestjs/common";
import { GitAccess } from "../repo/git-access.ts";
import { GIT_PROVIDER, GIT_READ_CACHE, type GitProviderBinding } from "../repo/tokens.ts";
import type { ComponentRow } from "../spec-architecture/spec-architecture.repository.ts";
import { readCommittedFile } from "../spec-data/committed-file.ts";
import { indexFailed } from "../spec-read/index-failed.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { contractCode, contractPath, generatorAvailability } from "./contract-generator.ts";
import {
  nfrSummary,
  operationContent,
  operationOptions,
  operationSource,
  operationSummary,
} from "./operation-values.ts";
import {
  type IndexedPage,
  SPEC_TECHNICAL_API_REPOSITORY,
  type SpecTechnicalApiRepository,
} from "./spec-technical-api.repository.ts";
import { stackSummary } from "./technical-values.ts";

interface PageOutput<T> {
  items: T[];
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
  total: number;
  facets: Record<string, Record<string, number>>;
}

/** Page rendue depuis l'index ; révision non indexée : liste et facette vides. */
function pageOutput<T>(
  indexed: IndexedPage,
  dimension: "zone" | "category",
  itemOf: (row: ComponentRow) => T,
): PageOutput<T> {
  if (indexed?.kind === "failed") throw indexFailed(indexed);
  if (indexed === null) {
    const empty = { items: [], nextCursor: null, previousCursor: null, offset: 0, total: 0 };
    return { ...empty, facets: { [dimension]: {} } };
  }
  const { items, facets, ...position } = indexed.page;
  return { ...position, facets, items: items.map(itemOf) };
}

/**
 * Onglets API et Exigences (TK-116) : tout vient de l'index d'entités ; seul le YAML d'une opération est lu chez le
 * fournisseur au commit indexé, hors transaction. Le contrat est calculé à la lecture et n'est écrit nulle part.
 */
@Injectable()
export class SpecTechnicalApiService {
  constructor(
    @Inject(SPEC_TECHNICAL_API_REPOSITORY)
    private readonly repository: SpecTechnicalApiRepository,
    @Inject(GIT_PROVIDER) private readonly provider: GitProviderBinding,
    @Inject(GitAccess) private readonly access: GitAccess,
    @Inject(GIT_READ_CACHE) private readonly cache: GitReadCache,
  ) {}

  async operationList(
    scope: ProjectScope,
    input: Omit<OperationListInput, "projectId">,
  ): Promise<PageOutput<OperationSummary>> {
    const { branch, commitSha, zone, q, cursor, around, limit } = input;
    const indexed = await this.repository.operationPage(
      scope,
      { branch, commitSha },
      { zone, q, cursor, around, limit: limit ?? OPERATION_PAGE_SIZE },
    );
    return pageOutput(indexed, "zone", (row) => operationSummary(row.specId, row.path, row.data));
  }

  /** L'opération de la révision ; inconnue ou rien d'indexé : 404. */
  private async found(scope: ProjectScope, { branch, commitSha }: Revision, id: string) {
    const found = await this.repository.operation(scope, { branch, commitSha }, id);
    if (found?.kind === "failed") throw indexFailed(found);
    return orNotFound(found);
  }

  /** Fiche d'une opération (onglet API et panneau d'édition). */
  async operation(scope: ProjectScope, revision: Revision, id: string): Promise<OperationDetail> {
    const { row, roles, source } = await this.found(scope, revision, id);
    return { ...operationContent(row, roles), commitSha: source.commitSha };
  }

  /** `api/endpoints/<zone.verbe>.yaml` au commit indexé ; absent du dépôt : régénéré depuis l'index. */
  async operationSource(
    scope: ProjectScope,
    revision: Revision,
    id: string,
  ): Promise<ArchitectureSource> {
    const { row, source } = await this.found(scope, revision, id);
    const stored = await readCommittedFile(
      this.provider,
      this.access,
      this.cache,
      source,
      row.path,
    );
    return {
      path: row.path,
      text: stored ?? operationSource(row.data),
      commitSha: source.commitSha,
      generated: stored === undefined,
    };
  }

  async options(scope: ProjectScope, { branch, commitSha }: Revision): Promise<OperationOptions> {
    const found = await this.repository.options(scope, { branch, commitSha });
    if (found?.kind === "failed") throw indexFailed(found);
    return found === null
      ? { zones: [], permissions: [] }
      : operationOptions(found.zoned, found.roles);
  }

  /** Contrat généré depuis l'index et le choix `ST-api` (B770) ; sans générateur : la raison. */
  async contract(scope: ProjectScope, revision: Revision, id: string): Promise<TechnicalContract> {
    const { row, roles, contractStack, source } = await this.found(scope, revision, id);
    const chosen =
      contractStack === null
        ? undefined
        : stackSummary(contractStack.specId, contractStack.path, contractStack.data);
    const availability = generatorAvailability(chosen);
    const { commitSha } = source;
    if (!availability.available) return { ...availability, commitSha };
    const operation = operationContent(row, roles);
    return {
      ...availability,
      path: contractPath(operation),
      code: contractCode(operation),
      commitSha,
    };
  }

  async nfrList(
    scope: ProjectScope,
    input: Omit<NfrListInput, "projectId">,
  ): Promise<PageOutput<NfrSummary>> {
    const { branch, commitSha, category, cursor, around, limit } = input;
    const indexed = await this.repository.nfrPage(
      scope,
      { branch, commitSha },
      { category, cursor, around, limit: limit ?? NFR_PAGE_SIZE },
    );
    return pageOutput(indexed, "category", (row) => nfrSummary(row.specId, row.path, row.data));
  }

  /** Fiche d'une exigence (panneau d'édition) ; inconnue : 404. */
  async nfr(scope: ProjectScope, id: string): Promise<NfrDetail> {
    const found = await this.repository.nfr(scope, {}, id);
    if (found?.kind === "failed") throw indexFailed(found);
    const { row, commitSha } = orNotFound(found);
    return { ...nfrSummary(row.specId, row.path, row.data), commitSha };
  }
}
