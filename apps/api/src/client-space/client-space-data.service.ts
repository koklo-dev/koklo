import type {
  ClientDataTable,
  ClientSpaceDataFixtureRows,
  ClientSpaceDataFixtures,
  ClientSpaceDataModel,
  ClientSpaceDataSearch,
  ClientSpaceDataZone,
  ClientSpaceDataZones,
} from "@koklo/contract";
import { DATA_SEARCH_MAX } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { fixturePage, tableSearchItem } from "../spec-data/data-values.ts";
import { buildZone, buildZones, zoneTables } from "../spec-data/data-zones.ts";
import { SpecDataService } from "../spec-data/spec-data.service.ts";
import { SpecDeliverablesService } from "../spec-deliverables/spec-deliverables.service.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  CLIENT_SPACE_DATA_REPOSITORY,
  type ClientSpaceDataRepository,
} from "./client-space-data.repository.ts";
import { clientFixtureOf, clientTableOf, sourceIdsOf } from "./client-space-data.ts";

/** Bornes du modèle montré (B452) : au-delà, `truncated`. */
const MODEL_TABLES_MAX = 100;
const ROWS_PER_PAGE = 25;
type Validation = ClientSpaceDataModel["validation"];

const UNAVAILABLE = (validation: Validation): ClientSpaceDataModel => ({
  available: false,
  validation,
  truncated: false,
  items: [],
  positions: {},
});

const NO_ZONES = (validation: Validation): ClientSpaceDataZones => ({
  available: false,
  validation,
  zones: [],
  tableCount: 0,
});

const NO_ZONE = (validation: Validation): ClientSpaceDataZone => ({
  available: false,
  validation,
  items: [],
  relations: [],
  outgoing: [],
  truncated: false,
});

/**
 * Modèle de données validé, vu du client (TK-109, B450 à B452). Rien n'est montré tant que l'équipe n'a pas validé le livrable
 * (ou s'il est « À revoir ») : `available` faux, aucune table. Aucune écriture ; vocabulaire du client seulement.
 */
@Injectable()
export class ClientSpaceDataService {
  constructor(
    @Inject(CLIENT_SPACE_DATA_REPOSITORY) private readonly repository: ClientSpaceDataRepository,
    @Inject(SpecDeliverablesService) private readonly deliverables: SpecDeliverablesService,
    @Inject(SpecDataService) private readonly spec: SpecDataService,
  ) {}

  /** Statut du livrable Données au contenu courant ; jamais de propositions (rôle fermé par défaut). */
  private async validation(scope: ProjectScope): Promise<Validation> {
    const { deliverables } = await this.deliverables.list(scope, undefined);
    const status = deliverables.find((entry) => entry.key === "data")?.status;
    if (status === "validated") return "validated";
    return status === "revise" ? "to_revise" : "to_validate";
  }

  /** Positions enregistrées par l'équipe ; illisibles ou absentes : aucune (le placement se fait côté vue). */
  private async positions(scope: ProjectScope, ids: ReadonlySet<string>) {
    try {
      const { positions } = await this.spec.layout(scope, {});
      return Object.fromEntries(Object.entries(positions).filter(([id]) => ids.has(id)));
    } catch {
      return {};
    }
  }

  async model(scope: ProjectScope): Promise<ClientSpaceDataModel> {
    const validation = await this.validation(scope);
    if (validation !== "validated") return UNAVAILABLE(validation);
    const read = await this.repository.model(scope, MODEL_TABLES_MAX);
    if (read === null) return UNAVAILABLE("to_validate");
    const names = new Map(
      read.tables.map((table) => [table.specId, clientTableOf(table, read.labels, new Map()).name]),
    );
    const items = read.tables.map((table) => clientTableOf(table, read.labels, names));
    return {
      available: true,
      validation,
      truncated: read.truncated,
      items,
      positions: await this.positions(scope, new Set(items.map((item) => item.id))),
    };
  }

  async fixtures(scope: ProjectScope): Promise<ClientSpaceDataFixtures> {
    if ((await this.validation(scope)) !== "validated") return { items: [] };
    return { items: (await this.repository.fixtures(scope)).map(clientFixtureOf) };
  }

  /** Une page de 25 lignes (déprécié, voir `fixturePage`) ; modèle non validé ou jeu inconnu : 404 ; page au-delà de la fin : vide. */
  fixtureRows(
    scope: ProjectScope,
    input: { fixtureId: string; page: number },
  ): Promise<ClientSpaceDataFixtureRows> {
    return this.fixturePage(scope, { ...input, size: ROWS_PER_PAGE });
  }

  /** Une page de 25, 50 ou 100 lignes, stockées puis générées ; modèle non validé ou jeu inconnu : 404. */
  async fixturePage(
    scope: ProjectScope,
    input: { fixtureId: string; page: number; size: number },
  ): Promise<ClientSpaceDataFixtureRows> {
    orNotFound((await this.validation(scope)) === "validated" ? true : null);
    const fixture = orNotFound(await this.repository.fixture(scope, input.fixtureId));
    return { ...fixturePage(fixture.data, input.page, input.size), totalIsEstimate: false };
  }

  /** Zones du modèle validé (B482, B483) : toutes les tables de la tête, pas seulement les 100 premières. */
  async zones(scope: ProjectScope): Promise<ClientSpaceDataZones> {
    const validation = await this.validation(scope);
    if (validation !== "validated") return NO_ZONES(validation);
    const rows = await this.repository.tables(scope);
    if (rows === null) return NO_ZONES("to_validate");
    const styles = await this.spec.headZoneStyles(scope);
    return { available: true, validation, ...buildZones(zoneTables(rows), styles) };
  }

  /** Une zone ouverte au vocabulaire du client (200 tables au plus) ; zone inconnue : 404. */
  async zone(scope: ProjectScope, zone: string): Promise<ClientSpaceDataZone> {
    const validation = await this.validation(scope);
    if (validation !== "validated") return NO_ZONE(validation);
    const rows = await this.repository.tables(scope);
    if (rows === null) return NO_ZONE("to_validate");
    const tables = zoneTables(rows);
    const view = orNotFound(buildZone(tables, await this.spec.headZoneStyles(scope), zone));
    const labels = await this.repository.labels(
      scope,
      view.members.flatMap((member) => sourceIdsOf(member.data)),
    );
    const names = new Map(tables.map((table) => [table.id, table.name]));
    const items: ClientDataTable[] = view.members.map((member) =>
      clientTableOf({ specId: member.id, data: member.data }, labels, names),
    );
    return {
      available: true,
      validation,
      zone: view.zone,
      items,
      relations: view.relations,
      outgoing: view.outgoing,
      truncated: view.truncated,
    };
  }

  /** Recherche d'une table par nom ou par champ, 20 au plus ; rien que l'identifiant, le nom et la zone. */
  async search(scope: ProjectScope, q: string): Promise<ClientSpaceDataSearch> {
    if ((await this.validation(scope)) !== "validated") return { available: false, items: [] };
    const rows = await this.repository.searchTables(scope, q, DATA_SEARCH_MAX);
    return { available: true, items: rows.map((row) => tableSearchItem(row.specId, row.data)) };
  }
}
