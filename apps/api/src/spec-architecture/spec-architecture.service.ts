import type {
  ArchitectureChecks,
  ArchitectureComponentSummary,
  ArchitectureComponentsListInput,
  ArchitectureDocument,
} from "@koklo/contract";
import { architectureChecks } from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { GitAccess, step } from "../repo/git-access.ts";
import { GIT_PROVIDER, type GitProviderBinding } from "../repo/tokens.ts";
import { indexFailed } from "../spec-read/index-failed.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  checksInputOf,
  componentSummary,
  DOC_SECTIONS_MAX,
  docSectionsOf,
  isDocSectionPath,
} from "./architecture-values.ts";
import {
  type GitSource,
  SPEC_ARCHITECTURE_REPOSITORY,
  type SpecArchitectureRepository,
} from "./spec-architecture.repository.ts";

type Revision = { branch?: string; commitSha?: string };

interface ComponentsPageOutput {
  items: ArchitectureComponentSummary[];
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
  total: number;
  facets: Record<string, Record<string, number>>;
}

/** Page rendue pour une révision non indexée : liste vide, facettes vides. */
const EMPTY_COMPONENTS: ComponentsPageOutput = {
  items: [],
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: 0,
  facets: { zone: {} },
};

/**
 * Lectures de la page Architecture (TK-111) : composants et avertissements viennent de l'index d'entités ; seul le document
 * (sections `architecture/overview/NN-<slug>.md`, jamais indexées, B508) est lu chez le fournisseur au commit indexé, hors
 * transaction. Aucune écriture, aucune entrée d'audit ; jamais de YAML ni de Mermaid dans les réponses.
 */
@Injectable()
export class SpecArchitectureService {
  constructor(
    @Inject(SPEC_ARCHITECTURE_REPOSITORY) private readonly repository: SpecArchitectureRepository,
    @Inject(GIT_PROVIDER) private readonly provider: GitProviderBinding,
    @Inject(GitAccess) private readonly access: GitAccess,
  ) {}

  async components(
    scope: ProjectScope,
    input: ArchitectureComponentsListInput,
  ): Promise<ComponentsPageOutput> {
    const { branch, commitSha, zone, q, cursor, around, limit } = input;
    const indexed = await this.repository.componentsPage(
      scope,
      { branch, commitSha },
      { zone, q, cursor, around, limit: limit ?? DEFAULT_PAGE_SIZE },
    );
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    if (indexed === null) return EMPTY_COMPONENTS;
    const { items, ...position } = indexed.page;
    return {
      ...position,
      items: items.map((row) => componentSummary(row.specId, row.path, row.data)),
    };
  }

  /** Sections du document lues dans git au commit indexé, dans l'ordre de leur numéro ; rien d'indexé : 404. */
  async document(scope: ProjectScope, input: Revision): Promise<ArchitectureDocument> {
    const source = await this.repository.headSource(scope, input);
    if (source?.kind === "failed") throw indexFailed(source);
    const found = orNotFound(source);
    return {
      sections: docSectionsOf(await this.readSections(found)),
      commitSha: found.commitSha,
    };
  }

  /** Avertissements non bloquants : index de tête plus propositions en attente du lancement ouvert (B511). */
  async checks(scope: ProjectScope): Promise<ArchitectureChecks> {
    const indexed = await this.repository.checkFacts(scope);
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    if (indexed === null) return { warnings: [] };
    return { warnings: architectureChecks(checksInputOf(indexed.facts)) };
  }

  /** Fichiers de section de l'arbre au commit indexé (`DOC_SECTIONS_MAX` au plus) ; sans fournisseur utilisable : indisponible. */
  private async readSections(source: GitSource): Promise<{ path: string; content: string }[]> {
    const provider = this.provider;
    if (provider === null || !source.installation.active) {
      throw new ORPCError("PROVIDER_UNAVAILABLE");
    }
    const auth = await this.access.installationAuth(provider, {
      id: source.installation.id,
      externalId: source.installation.externalId,
      ownerKind: source.owner.kind,
      ownerLogin: source.owner.login,
    });
    const repo = { owner: source.owner, name: source.repoName };
    const prefix = source.specPath === null ? "" : `${source.specPath}/`;
    const listing = await step("readFile", () =>
      provider.listFiles({ auth, repo, ref: source.commitSha }),
    );
    const paths = listing.files
      .map((file) => file.path)
      .filter((path) => path.startsWith(prefix) && isDocSectionPath(path.slice(prefix.length)))
      .slice(0, DOC_SECTIONS_MAX);
    const files: { path: string; content: string }[] = [];
    for (const path of paths) {
      const file = await step("readFile", () =>
        provider.readFile({ auth, repo, ref: source.commitSha, path }),
      );
      files.push({ path: path.slice(prefix.length), content: file.content });
    }
    return files;
  }
}
