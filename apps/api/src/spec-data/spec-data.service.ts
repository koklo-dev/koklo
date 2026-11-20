import type {
  DataFixturePage,
  DataFixturePageInput,
  DataFixtureRows,
  DataFixtureRowsInput,
  DataFixtureSummary,
  DataLayout,
  DataLayoutSaved,
  DataMermaid,
  DataSearch,
  DataSearchInput,
  DataTableSource,
  DataTableSummary,
  DataTablesListInput,
  DataZone,
  DataZoneInput,
  DataZones,
} from "@koklo/contract";
import { GitNotFoundError, SCOPING_BRANCH } from "@koklo/domain";
import {
  emitModelMermaid,
  emitTableYaml,
  LAYOUT_PATH,
  type LayoutPositions,
  parseLayout,
  parseZones,
  type TableV2,
  TableV2Schema,
  ZONES_PATH,
  type ZoneStyle,
} from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { GitAccess } from "../repo/git-access.ts";
import { mapProviderError } from "../repo/provider-errors.ts";
import { GIT_PROVIDER, type GitProviderBinding } from "../repo/tokens.ts";
import { SpecBatchService } from "../spec-batch/spec-batch.service.ts";
import { indexFailed } from "../spec-read/index-failed.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import { DEFAULT_PAGE_SIZE } from "../tracker/cursor.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  fieldsOf,
  fixturePage,
  fixtureSummary,
  tableSearchItem,
  tableSummary,
} from "./data-values.ts";
import { buildZone, buildZones, type ZoneTable, zoneTables } from "./data-zones.ts";
import {
  type GitSource,
  SPEC_DATA_REPOSITORY,
  type SpecDataRepository,
} from "./spec-data.repository.ts";

const ROWS_PER_PAGE = 25;
/** Résultats de `spec.data.search` (B483). */
const SEARCH_LIMIT = 20;
const LAYOUT_MESSAGE = "Mise en page du diagramme";

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

type Revision = { branch?: string; commitSha?: string };

/** Table d'une zone ouverte, vue de l'équipe : nom, zone et champs. */
const teamZoneTable = (table: ZoneTable): DataZone["tables"][number] => {
  const fields = fieldsOf(table.data);
  return {
    specId: table.id,
    name: table.name,
    ...(table.zone === undefined ? {} : { zone: table.zone }),
    fields: fields.map(({ name, type, primaryKey, personalData }) => ({
      name,
      type,
      primaryKey,
      personalData,
    })),
    personalData: fields.some((field) => field.personalData),
  };
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
 * d'entités ; seuls `data/_layout.yaml` et le fichier d'une table sont lus chez le fournisseur au commit indexé, hors transaction.
 * Aucune écriture, aucune entrée d'audit.
 */
@Injectable()
export class SpecDataService {
  constructor(
    @Inject(SPEC_DATA_REPOSITORY) private readonly repository: SpecDataRepository,
    @Inject(GIT_PROVIDER) private readonly provider: GitProviderBinding,
    @Inject(GitAccess) private readonly access: GitAccess,
    @Inject(SpecBatchService) private readonly batches: SpecBatchService,
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

  /**
   * Texte Mermaid du modèle, toujours généré depuis les tables indexées du commit de tête (B476) : `data/model.mmd`
   * est un dérivé (B384) qui peut dater d'un émetteur antérieur (sans les relations des clés étrangères). Rien
   * d'indexé : 404.
   */
  async mermaid(
    scope: ProjectScope,
    input: { branch?: string; commitSha?: string },
  ): Promise<DataMermaid> {
    const source = await this.repository.modelSource(scope, input);
    if (source?.kind === "failed") throw indexFailed(source);
    const found = orNotFound(source);
    return {
      text: emitModelMermaid(validTables(found.tables.map((row) => row.data))),
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

  /** Une page de 25 lignes d'un jeu (déprécié, voir `fixturePage`) ; jeu absent : 404 ; page au-delà de la fin : liste vide. */
  fixtureRows(scope: ProjectScope, input: DataFixtureRowsInput): Promise<DataFixtureRows> {
    return this.fixturePage(scope, { ...input, size: ROWS_PER_PAGE });
  }

  /** Une page de 25, 50 ou 100 lignes d'un jeu, stockées puis générées (B485) ; jeu absent : 404 ; au-delà de la fin : vide. */
  async fixturePage(scope: ProjectScope, input: DataFixturePageInput): Promise<DataFixturePage> {
    const { branch, commitSha, fixtureId, page, size } = input;
    const indexed = await this.repository.fixture(scope, { branch, commitSha }, fixtureId);
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    const found = orNotFound(indexed);
    return { ...fixturePage(found.data, page, size), totalIsEstimate: false };
  }

  /** Zones du modèle (B483) : une carte par zone, comptes, aperçu et liens calculés sur toutes les tables de la tête. */
  async zones(scope: ProjectScope, input: Revision): Promise<DataZones> {
    const { tables, styles, commitSha } = await this.zoneModel(scope, input);
    return { ...buildZones(tables, styles), commitSha };
  }

  /** Une zone ouverte : ses tables (200 au plus), relations et liens sortants ; zone inconnue : 404. */
  async zone(scope: ProjectScope, input: DataZoneInput): Promise<DataZone> {
    const { zone, ...revision } = input;
    const { tables, styles, commitSha } = await this.zoneModel(scope, revision);
    const view = orNotFound(buildZone(tables, styles, zone));
    return {
      zone: view.zone,
      tables: view.members.map(teamZoneTable),
      relations: view.relations,
      outgoing: view.outgoing,
      truncated: view.truncated,
      commitSha,
    };
  }

  /** Recherche d'une table par nom ou par champ parmi toutes celles de la tête, 20 au plus (B483, B388). */
  async search(scope: ProjectScope, input: DataSearchInput): Promise<DataSearch> {
    const { q, ...revision } = input;
    const indexed = await this.repository.searchTables(scope, revision, q, SEARCH_LIMIT);
    if (indexed?.kind === "failed") throw indexFailed(indexed);
    return { items: (indexed?.rows ?? []).map((row) => tableSearchItem(row.specId, row.data)) };
  }

  /**
   * Libellés et icônes des zones : `data/_zones.yaml` au commit lu (B484) ; absent, illisible ou fournisseur injoignable : aucun
   * style (icône par défaut), un décor ne casse pas la vue.
   */
  private async zoneStyles(source: GitSource): Promise<ZoneStyle[]> {
    try {
      const text = await this.readCommitted(source, ZONES_PATH);
      const parsed = text === undefined ? undefined : parseZones(text);
      return parsed?.ok ? parsed.zones : [];
    } catch {
      return [];
    }
  }

  /** Styles des zones de la tête, pour la vue client ; jamais d'erreur (aucun style). */
  async headZoneStyles(scope: ProjectScope): Promise<ZoneStyle[]> {
    try {
      const source = await this.repository.headSource(scope, {});
      return source?.kind === "found" ? await this.zoneStyles(source) : [];
    } catch {
      return [];
    }
  }

  private async zoneModel(scope: ProjectScope, revision: Revision) {
    const source = await this.repository.modelSource(scope, revision);
    if (source?.kind === "failed") throw indexFailed(source);
    const found = orNotFound(source);
    return {
      tables: zoneTables(found.tables),
      styles: await this.zoneStyles(found),
      commitSha: found.commitSha,
    };
  }

  /** Positions du diagramme : `data/_layout.yaml` au commit de tête ; absent ou illisible : aucune position. */
  async layout(
    scope: ProjectScope,
    input: { branch?: string; commitSha?: string },
  ): Promise<DataLayout> {
    const source = await this.repository.headSource(scope, input);
    if (source?.kind === "failed") throw indexFailed(source);
    const found = orNotFound(source);
    const text = await this.readCommitted(found, LAYOUT_PATH);
    const parsed = text === undefined ? undefined : parseLayout(text);
    return { positions: parsed?.ok ? parsed.positions : {}, commitSha: found.commitSha };
  }

  /**
   * Enregistre les positions : un lot d'une opération `layout.save` sur `cadrage`, sans `baseSha` (le dernier écrit gagne,
   * B418). Le worker écrit le fichier ; le lot est audité comme tout lot de spec.
   */
  async saveLayout(
    scope: ProjectScope,
    role: string,
    input: { idempotencyKey: string; positions: LayoutPositions },
  ): Promise<DataLayoutSaved> {
    const batch = await this.batches.commitPrepared(scope, role, () => ({
      idempotencyKey: input.idempotencyKey,
      branch: SCOPING_BRANCH,
      baseSha: null,
      message: LAYOUT_MESSAGE,
      operations: [{ kind: "layout.save", specId: null, payload: { positions: input.positions } }],
    }));
    return { commitSha: batch.commitSha };
  }

  /** Fichier d'une table au commit lu ; absent du dépôt : YAML généré depuis l'index ; table inconnue : 404. */
  async tableSource(
    scope: ProjectScope,
    input: { tableId: string; branch?: string; commitSha?: string },
  ): Promise<DataTableSource> {
    const { tableId, ...revision } = input;
    const source = await this.repository.tableSource(scope, revision, tableId);
    if (source?.kind === "failed") throw indexFailed(source);
    const found = orNotFound(source);
    const committed = await this.readCommitted(found, found.path);
    if (committed !== undefined) {
      return { path: found.path, text: committed, commitSha: found.commitSha, generated: false };
    }
    const [table] = validTables([found.data]);
    return {
      path: found.path,
      text: emitTableYaml(orNotFound(table)),
      commitSha: found.commitSha,
      generated: true,
    };
  }

  /** Fichier de la spec au commit indexé ; `undefined` : absent, ou aucun fournisseur utilisable. */
  private async readCommitted(source: GitSource, file: string): Promise<string | undefined> {
    const provider = this.provider;
    if (provider === null || !source.installation.active) return undefined;
    const auth = await this.access.installationAuth(provider, {
      id: source.installation.id,
      externalId: source.installation.externalId,
      ownerKind: source.owner.kind,
      ownerLogin: source.owner.login,
    });
    const path = source.specPath === null ? file : `${source.specPath}/${file}`;
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
