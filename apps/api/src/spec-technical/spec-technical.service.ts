import type {
  ArchitectureDocument,
  ArchitectureSource,
  DocumentSectionsInput,
  SpecBatchOutput,
  StackChooseInput,
  StackDetail,
  StackListInput,
  StackSummary,
  TechnicalEnvironmentDetail,
  TechnicalEnvironments,
} from "@koklo/contract";
import { STACK_PAGE_SIZE } from "@koklo/contract";
import type { GitReadCache } from "@koklo/github";
import { Inject, Injectable } from "@nestjs/common";
import { GitAccess } from "../repo/git-access.ts";
import { GIT_PROVIDER, GIT_READ_CACHE, type GitProviderBinding } from "../repo/tokens.ts";
import { SpecArchitectureService } from "../spec-architecture/spec-architecture.service.ts";
import { SpecBatchService } from "../spec-batch/spec-batch.service.ts";
import { readCommittedFile } from "../spec-data/committed-file.ts";
import { indexFailed } from "../spec-read/index-failed.ts";
import type { Revision } from "../spec-read/spec-read.repository.ts";
import { orNotFound, validation } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  SPEC_TECHNICAL_REPOSITORY,
  type SpecTechnicalRepository,
} from "./spec-technical.repository.ts";
import { environmentsContent, stackSource, stackSummary } from "./technical-values.ts";

interface StackPageOutput {
  items: StackSummary[];
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
  total: number;
  facets: Record<string, Record<string, number>>;
}

/** Page rendue pour une révision non indexée : liste vide, facettes vides. */
const EMPTY_STACK: StackPageOutput = {
  items: [],
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: 0,
  facets: { layer: {}, status: {} },
};

/**
 * Page Technique (TK-115) : choix et environnements viennent de l'index d'entités ; le document et le YAML d'un choix sont
 * lus chez le fournisseur au commit indexé, hors transaction. « Choisir » est la seule écriture : un lot d'une
 * `stack.update`, par le chemin ordinaire des lots.
 */
@Injectable()
export class SpecTechnicalService {
  constructor(
    @Inject(SPEC_TECHNICAL_REPOSITORY) private readonly repository: SpecTechnicalRepository,
    @Inject(GIT_PROVIDER) private readonly provider: GitProviderBinding,
    @Inject(GitAccess) private readonly access: GitAccess,
    @Inject(GIT_READ_CACHE) private readonly cache: GitReadCache,
    @Inject(SpecArchitectureService) private readonly documents: SpecArchitectureService,
    @Inject(SpecBatchService) private readonly batches: SpecBatchService,
  ) {}

  async stackList(
    scope: ProjectScope,
    input: Omit<StackListInput, "projectId">,
  ): Promise<StackPageOutput> {
    const { branch, commitSha, q, cursor, around, limit } = input;
    const indexed = await this.repository.stackPage(
      scope,
      { branch, commitSha },
      { q, cursor, around, limit: limit ?? STACK_PAGE_SIZE },
    );
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    if (indexed === null) return EMPTY_STACK;
    const { items, ...position } = indexed.page;
    return {
      ...position,
      items: items.map((row) => stackSummary(row.specId, row.path, row.data)),
    };
  }

  /** Le choix de la révision et sa source ; inconnu ou rien d'indexé : 404. */
  private async foundStack(scope: ProjectScope, revision: Revision, id: string) {
    const found = await this.repository.stack(scope, revision, id);
    if (found?.kind === "failed") throw indexFailed(found);
    return orNotFound(found);
  }

  /** Fiche d'un choix (panneau d'édition). */
  async stack(scope: ProjectScope, id: string): Promise<StackDetail> {
    const { row, source } = await this.foundStack(scope, {}, id);
    return { ...stackSummary(row.specId, row.path, row.data), commitSha: source.commitSha };
  }

  /** `tech/stack/<slug>.yaml` au commit indexé ; absent du dépôt : régénéré depuis l'index. */
  async source(scope: ProjectScope, input: Revision & { id: string }): Promise<ArchitectureSource> {
    const { id, branch, commitSha } = input;
    const { row, source } = await this.foundStack(scope, { branch, commitSha }, id);
    const stored = await readCommittedFile(
      this.provider,
      this.access,
      this.cache,
      source,
      row.path,
    );
    return {
      path: row.path,
      text: stored ?? stackSource(row.data),
      commitSha: source.commitSha,
      generated: stored === undefined,
    };
  }

  private async environmentsRead(scope: ProjectScope, revision: Revision) {
    const found = await this.repository.environments(scope, revision);
    if (found?.kind === "failed") throw indexFailed(found);
    return found;
  }

  async environments(scope: ProjectScope, revision: Revision): Promise<TechnicalEnvironments> {
    const { branch, commitSha } = revision;
    const found = await this.environmentsRead(scope, { branch, commitSha });
    return {
      ...environmentsContent(found?.row?.data),
      commitSha: found?.commitSha ?? null,
    };
  }

  /** Fiche d'un environnement du fichier ; inconnu : 404. */
  async environment(scope: ProjectScope, id: string): Promise<TechnicalEnvironmentDetail> {
    const found = orNotFound(await this.environmentsRead(scope, {}));
    const environment = environmentsContent(found.row?.data).environments.find(
      (entry) => entry.specId === id,
    );
    return {
      ...orNotFound(environment),
      filePath: found.row?.path ?? "",
      commitSha: found.commitSha,
    };
  }

  /** Comptes de la tête (vue client) ; rien d'indexé : zéros. */
  async counts(scope: ProjectScope) {
    const none = { stack: 0, endpoints: 0, nfr: 0, environments: 0, operations: 0 };
    return (await this.repository.counts(scope)) ?? none;
  }

  sections(
    scope: ProjectScope,
    { deliverable, branch, commitSha }: Omit<DocumentSectionsInput, "projectId">,
  ): Promise<ArchitectureDocument> {
    return this.documents.document(scope, { branch, commitSha }, deliverable);
  }

  /** « Choisir » : l'option doit être l'une de celles du choix de la branche ; le lot suit le chemin ordinaire. */
  async choose(
    scope: ProjectScope,
    role: string,
    input: StackChooseInput,
  ): Promise<SpecBatchOutput> {
    const { projectId, id, option, idempotencyKey, branch, baseSha } = input;
    const { row } = await this.foundStack(scope, { branch }, id);
    if (!stackSummary(row.specId, row.path, row.data).options.includes(option)) {
      throw validation("option", "Cette option n'est pas comparée pour ce choix.");
    }
    return this.batches.submit(scope, role, {
      projectId,
      idempotencyKey,
      ...(branch === undefined ? {} : { branch }),
      ...(baseSha === undefined ? {} : { baseSha }),
      operations: [{ kind: "stack.update", specId: id, status: "chosen", choice: option }],
    });
  }
}
