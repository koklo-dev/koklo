import type {
  AdrByIdInput,
  AdrDetail,
  AdrListInput,
  AdrSummary,
  ArchitectureChecks,
  ArchitectureComponentSummary,
  ArchitectureComponentsListInput,
  ArchitectureDocument,
} from "@koklo/contract";
import type { GitReadCache } from "@koklo/github";
import { architectureChecks, type DocSectionDeliverable } from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { GitAccess, step } from "../repo/git-access.ts";
import { GIT_PROVIDER, GIT_READ_CACHE, type GitProviderBinding } from "../repo/tokens.ts";
import { committedReads } from "../spec-data/committed-file.ts";
import { indexFailed } from "../spec-read/index-failed.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { adrDetail, adrSummary, adrSupersession } from "./architecture-adrs.ts";
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

interface AdrsPageOutput {
  items: AdrSummary[];
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
  total: number;
  facets: Record<string, Record<string, number>>;
}

/** Page rendue pour une révision non indexée : liste vide, facettes vides. */
const EMPTY_ADRS: AdrsPageOutput = {
  items: [],
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: 0,
  facets: { status: {} },
};

/**
 * Lectures de la page Architecture (TK-111) : composants et avertissements viennent de l'index d'entités ; seul le document
 * (sections `NN-<slug>.md`, jamais indexées, B508 ; aussi celles du cahier technique, TK-115) est lu chez le fournisseur au
 * commit indexé, hors transaction. Aucune écriture, aucune entrée d'audit ; jamais de YAML ni de Mermaid dans les réponses.
 */
@Injectable()
export class SpecArchitectureService {
  constructor(
    @Inject(SPEC_ARCHITECTURE_REPOSITORY) private readonly repository: SpecArchitectureRepository,
    @Inject(GIT_PROVIDER) private readonly provider: GitProviderBinding,
    @Inject(GitAccess) private readonly access: GitAccess,
    @Inject(GIT_READ_CACHE) private readonly cache: GitReadCache,
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

  /** Décisions (TK-113) : pages de 50, recherche et filtres sur toute la tête, `around` pour un lien direct. */
  async adrs(scope: ProjectScope, input: AdrListInput): Promise<AdrsPageOutput> {
    const { branch, commitSha, cursor, around, limit, ...filters } = input;
    const indexed = await this.repository.adrsPage(
      scope,
      { branch, commitSha },
      { ...filters, cursor, around, limit: limit ?? DEFAULT_PAGE_SIZE },
    );
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    if (indexed === null) return EMPTY_ADRS;
    const { items, ...position } = indexed.page;
    return {
      ...position,
      items: items.map((row) => adrSummary(row.specId, row.path, row.data)),
    };
  }

  /** Fiche d'une décision, avec la date de sa remplaçante ; inconnue ou rien d'indexé : 404. */
  async adr(
    scope: ProjectScope,
    input: Pick<AdrByIdInput, "adrId" | "branch" | "commitSha">,
  ): Promise<AdrDetail> {
    const { adrId, branch, commitSha } = input;
    const found = await this.repository.adr(scope, { branch, commitSha }, adrId);
    if (found?.kind === "failed") throw indexFailed(found);
    const { adr, replacedBy, commitSha: sha } = orNotFound(found);
    const dates = new Map<string, string>();
    const date = (replacedBy?.data as { date?: unknown } | null | undefined)?.date;
    if (replacedBy && typeof date === "string") dates.set(replacedBy.specId, date);
    return adrDetail(
      adr.specId,
      adr.data,
      { filePath: adr.path, commitSha: sha },
      adrSupersession(adr.data, dates),
    );
  }

  /**
   * Sections d'un document (architecture, ou cahier technique, TK-115) lues dans git au commit indexé, dans l'ordre de leur
   * numéro ; rien d'indexé : 404.
   */
  async document(
    scope: ProjectScope,
    input: Revision,
    deliverable: DocSectionDeliverable = "architecture",
  ): Promise<ArchitectureDocument> {
    const source = await this.repository.headSource(scope, input);
    if (source?.kind === "failed") throw indexFailed(source);
    const found = orNotFound(source);
    return {
      sections: docSectionsOf(await this.readSections(found, deliverable), deliverable),
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

  /**
   * Chemins de l'arbre au commit indexé de la branche par défaut, relatifs à la racine de la spec (TK-114g, B699 : réglage des
   * propositions déjà présentes). `null` sans index lisible ni fournisseur utilisable ; une erreur du fournisseur remonte.
   */
  async headSpecPaths(scope: ProjectScope): Promise<string[] | null> {
    const source = await this.repository.headSource(scope, {});
    if (source === null || source.kind === "failed") return null;
    if (this.provider === null || !source.installation.active) return null;
    return (await this.treeAt(this.provider, source)).paths;
  }

  /** Fichiers de section de l'arbre au commit indexé (`DOC_SECTIONS_MAX` au plus) ; sans fournisseur utilisable : indisponible. */
  private async readSections(
    source: GitSource,
    deliverable: DocSectionDeliverable,
  ): Promise<{ path: string; content: string }[]> {
    if (this.provider === null || !source.installation.active) {
      throw new ORPCError("PROVIDER_UNAVAILABLE");
    }
    const { reads, at, paths, prefix } = await this.treeAt(this.provider, source);
    const sections = paths
      .filter((path) => isDocSectionPath(path, deliverable))
      .slice(0, DOC_SECTIONS_MAX);
    const files: { path: string; content: string }[] = [];
    for (const path of sections) {
      const file = await step("readFile", () =>
        reads.readFile({ ...at, path: `${prefix}${path}` }),
      );
      files.push({ path, content: file.content });
    }
    return files;
  }

  /** Arbre au commit indexé, lu par le cache des lectures git (TK-114f) : chemins relatifs à la racine de la spec. */
  private async treeAt(provider: NonNullable<GitProviderBinding>, source: GitSource) {
    const { reads, at } = await committedReads(provider, this.access, this.cache, source);
    const prefix = source.specPath === null ? "" : `${source.specPath}/`;
    const listing = await step("readFile", () => reads.listFiles(at));
    const paths = listing.files
      .map((file) => file.path)
      .filter((path) => path.startsWith(prefix))
      .map((path) => path.slice(prefix.length));
    return { reads, at, paths, prefix };
  }
}
