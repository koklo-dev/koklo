import type {
  DataFixtureRows,
  DataFixtureRowsInput,
  DataFixtureSummary,
  DataMermaid,
  DataTableSummary,
  DataTablesListInput,
} from "@koklo/contract";
import { GitNotFoundError } from "@koklo/domain";
import { emitModelMermaid, type TableV2, TableV2Schema } from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { GitAccess } from "../repo/git-access.ts";
import { mapProviderError } from "../repo/provider-errors.ts";
import { GIT_PROVIDER, type GitProviderBinding } from "../repo/tokens.ts";
import { indexFailed } from "../spec-read/index-failed.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { columnsOf, fixtureSummary, rowsOf, tableSummary } from "./data-values.ts";
import {
  type ModelSource,
  SPEC_DATA_REPOSITORY,
  type SpecDataRepository,
} from "./spec-data.repository.ts";

const MODEL_PATH = "data/model.mmd";
const ROWS_PER_PAGE = 25;

interface TablesPageOutput {
  items: DataTableSummary[];
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
  total: number;
  facets: Record<string, Record<string, number>>;
}

/** Page rendue pour une révision non indexée : liste vide, facettes vides. */
const EMPTY_TABLES: TablesPageOutput = {
  items: [],
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total: 0,
  facets: { zone: {} },
};

/** Tables valides de l'index : l'ajout `titre` de l'index est retiré avant de relire le schéma, un contenu invalide est écarté. */
function validTables(rows: readonly unknown[]): TableV2[] {
  return rows.flatMap((data) => {
    if (typeof data !== "object" || data === null) return [];
    const { titre: _titre, ...table } = data as Record<string, unknown>;
    const parsed = TableV2Schema.safeParse(table);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Lectures de la page Données (TK-107) : tables, modèle Mermaid, jeux d'exemple et leurs lignes. Tout vient de l'index
 * d'entités ; seul le texte de `data/model.mmd` est lu chez le fournisseur au commit indexé (sinon généré), hors transaction.
 * Aucune écriture, aucune entrée d'audit.
 */
@Injectable()
export class SpecDataService {
  constructor(
    @Inject(SPEC_DATA_REPOSITORY) private readonly repository: SpecDataRepository,
    @Inject(GIT_PROVIDER) private readonly provider: GitProviderBinding,
    @Inject(GitAccess) private readonly access: GitAccess,
  ) {}

  async tables(scope: ProjectScope, input: DataTablesListInput): Promise<TablesPageOutput> {
    const { branch, commitSha, zone, q, cursor, around, limit } = input;
    const indexed = await this.repository.tablesPage(
      scope,
      { branch, commitSha },
      { zone, q, cursor, around, limit: limit ?? DEFAULT_PAGE_SIZE },
    );
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    if (indexed === null) return EMPTY_TABLES;
    const { items, ...position } = indexed.page;
    return {
      ...position,
      items: items.map((row) => tableSummary(row.specId, row.path, row.data, row.relationCount)),
    };
  }

  /** Texte Mermaid du modèle : `data/model.mmd` du commit de tête, sinon généré depuis les tables ; rien d'indexé : 404. */
  async mermaid(
    scope: ProjectScope,
    input: { branch?: string; commitSha?: string },
  ): Promise<DataMermaid> {
    const source = await this.repository.modelSource(scope, input);
    if (source?.kind === "failed") throw indexFailed(source);
    const found = orNotFound(source);
    const committed = await this.committedModel(found);
    if (committed !== undefined) {
      return { text: committed, generated: false, commitSha: found.commitSha };
    }
    return {
      text: emitModelMermaid(validTables(found.tables)),
      generated: true,
      commitSha: found.commitSha,
    };
  }

  async fixtures(
    scope: ProjectScope,
    input: { branch?: string; commitSha?: string },
  ): Promise<{ items: DataFixtureSummary[] }> {
    const indexed = await this.repository.fixtures(scope, input);
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    return {
      items: (indexed?.rows ?? []).map((row) => fixtureSummary(row.specId, row.path, row.data)),
    };
  }

  /** Une page de 25 lignes d'un jeu ; jeu absent : 404 ; page au-delà de la fin : liste vide. */
  async fixtureRows(scope: ProjectScope, input: DataFixtureRowsInput): Promise<DataFixtureRows> {
    const { branch, commitSha, fixtureId, page } = input;
    const indexed = await this.repository.fixture(scope, { branch, commitSha }, fixtureId);
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    const found = orNotFound(indexed);
    const rows = rowsOf(found.data);
    const start = (page - 1) * ROWS_PER_PAGE;
    return {
      columns: columnsOf(rows),
      items: rows.slice(start, start + ROWS_PER_PAGE),
      total: rows.length,
      totalIsEstimate: false,
    };
  }

  /** `data/model.mmd` au commit indexé ; `undefined` : absent, ou aucun fournisseur utilisable (le texte est alors généré). */
  private async committedModel(source: ModelSource): Promise<string | undefined> {
    const provider = this.provider;
    if (provider === null || !source.installation.active) return undefined;
    const auth = await this.access.installationAuth(provider, {
      id: source.installation.id,
      externalId: source.installation.externalId,
      ownerKind: source.owner.kind,
      ownerLogin: source.owner.login,
    });
    const path = source.specPath === null ? MODEL_PATH : `${source.specPath}/${MODEL_PATH}`;
    try {
      const file = await provider.readFile({
        auth,
        repo: { owner: source.owner, name: source.repoName },
        ref: source.commitSha,
        path,
      });
      return file.content;
    } catch (error) {
      if (error instanceof GitNotFoundError) return undefined;
      throw mapProviderError(error, "readFile");
    }
  }
}
