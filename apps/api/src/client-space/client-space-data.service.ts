import type {
  ClientSpaceDataFixtureRows,
  ClientSpaceDataFixtures,
  ClientSpaceDataModel,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { columnsOf, rowsOf } from "../spec-data/data-values.ts";
import { SpecDataService } from "../spec-data/spec-data.service.ts";
import { SpecDeliverablesService } from "../spec-deliverables/spec-deliverables.service.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  CLIENT_SPACE_DATA_REPOSITORY,
  type ClientSpaceDataRepository,
} from "./client-space-data.repository.ts";
import { clientFixtureOf, clientTableOf } from "./client-space-data.ts";

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

/**
 * Modèle de données validé, vu du client (TK-109, B450 à B452). Rien n'est montré tant que l'équipe n'a pas validé le livrable
 * (ou s'il est « À revoir ») : `available` faux, aucune table. Aucune écriture ; vocabulaire du client seulement.
 */
@Injectable()
export class ClientSpaceDataService {
  constructor(
    @Inject(CLIENT_SPACE_DATA_REPOSITORY) private readonly repository: ClientSpaceDataRepository,
    @Inject(SpecDeliverablesService) private readonly deliverables: SpecDeliverablesService,
    @Inject(SpecDataService) private readonly layout: SpecDataService,
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
      const { positions } = await this.layout.layout(scope, {});
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

  /** Une page de 25 lignes ; modèle non validé ou jeu inconnu : 404 ; page au-delà de la fin : liste vide. */
  async fixtureRows(
    scope: ProjectScope,
    input: { fixtureId: string; page: number },
  ): Promise<ClientSpaceDataFixtureRows> {
    orNotFound((await this.validation(scope)) === "validated" ? true : null);
    const fixture = orNotFound(await this.repository.fixture(scope, input.fixtureId));
    const rows = rowsOf(fixture.data);
    const start = (input.page - 1) * ROWS_PER_PAGE;
    return {
      columns: columnsOf(rows),
      items: rows.slice(start, start + ROWS_PER_PAGE),
      total: rows.length,
      totalIsEstimate: false,
    };
  }
}
