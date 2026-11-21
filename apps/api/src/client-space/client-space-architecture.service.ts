import type {
  ClientSpaceAdr,
  ClientSpaceAdrs,
  ClientSpaceArchFlow,
  ClientSpaceArchFlows,
  ClientSpaceArchitecture,
} from "@koklo/contract";
import { CLIENT_ARCHITECTURE_COMPONENTS_MAX } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { SpecArchitectureService } from "../spec-architecture/spec-architecture.service.ts";
import { SpecArchitectureDiagramService } from "../spec-architecture/spec-architecture-diagram.service.ts";
import { SpecDeliverablesService } from "../spec-deliverables/spec-deliverables.service.ts";
import { orNotFound } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  CLIENT_SPACE_ARCHITECTURE_REPOSITORY,
  type ClientSpaceArchitectureRepository,
} from "./client-space-architecture.repository.ts";
import { clientAdrOf, clientArchFlowOf, clientComponentOf } from "./client-space-architecture.ts";

type Validation = ClientSpaceArchitecture["validation"];
/** Pages de décisions et de flux : 50 au plus, comme l'équipe. */
const PAGE_MAX = 50;

const NO_PAGE = { nextCursor: null, previousCursor: null, offset: 0, total: 0 } as const;
const UNAVAILABLE = (validation: Validation): ClientSpaceArchitecture => ({
  available: false,
  validation,
  truncated: false,
  items: [],
  positions: {},
});

/**
 * Architecture validée, vue du client (TK-113, B575 à B592). Rien n'est montré tant que l'équipe n'a pas validé le livrable (ou
 * s'il est « À revoir ») : `available` faux, aucun contenu ; une fiche demandée alors est un 404. Aucune écriture (les remarques
 * passent par `comment.create`) ; vocabulaire du client seulement : jamais de YAML, de Mermaid, de chemin ni de SHA.
 */
@Injectable()
export class ClientSpaceArchitectureService {
  constructor(
    @Inject(CLIENT_SPACE_ARCHITECTURE_REPOSITORY)
    private readonly repository: ClientSpaceArchitectureRepository,
    @Inject(SpecDeliverablesService) private readonly deliverables: SpecDeliverablesService,
    @Inject(SpecArchitectureService) private readonly adrsOf: SpecArchitectureService,
    @Inject(SpecArchitectureDiagramService)
    private readonly diagram: SpecArchitectureDiagramService,
  ) {}

  /** Statut du livrable Architecture au contenu courant ; jamais de propositions (rôle fermé par défaut). */
  private async validation(scope: ProjectScope): Promise<Validation> {
    const { deliverables } = await this.deliverables.list(scope, undefined);
    const status = deliverables.find((entry) => entry.key === "architecture")?.status;
    if (status === "validated") return "validated";
    return status === "revise" ? "to_revise" : "to_validate";
  }

  /** Positions enregistrées par l'équipe ; illisibles ou absentes : aucune (le placement se fait côté vue). */
  private async positions(scope: ProjectScope, ids: ReadonlySet<string>) {
    try {
      const { positions } = await this.diagram.layout(scope, {});
      return Object.fromEntries(Object.entries(positions).filter(([id]) => ids.has(id)));
    } catch {
      return {};
    }
  }

  async architecture(scope: ProjectScope): Promise<ClientSpaceArchitecture> {
    const validation = await this.validation(scope);
    if (validation !== "validated") return UNAVAILABLE(validation);
    const read = await this.repository.read(scope, CLIENT_ARCHITECTURE_COMPONENTS_MAX);
    if (read === null) return UNAVAILABLE("to_validate");
    const items = read.components.map((row) => clientComponentOf(row.specId, row.data, read));
    return {
      available: true,
      validation,
      truncated: read.truncated,
      items,
      positions: await this.positions(scope, new Set(items.map((item) => item.id))),
    };
  }

  async adrs(
    scope: ProjectScope,
    input: {
      status?: "proposee" | "acceptee" | "remplacee";
      q?: string;
      cursor?: string;
      around?: string;
      limit?: number;
    },
  ): Promise<ClientSpaceAdrs> {
    const validation = await this.validation(scope);
    if (validation !== "validated") return { available: false, validation, items: [], ...NO_PAGE };
    const page = await this.adrsOf.adrs(scope, {
      ...input,
      projectId: scope.projectId,
      limit: Math.min(input.limit ?? PAGE_MAX, PAGE_MAX),
    });
    return {
      available: true,
      validation,
      ...page,
      items: page.items.map(({ specId, title, status, date }) => ({
        id: specId,
        title,
        status,
        date,
      })),
    };
  }

  /** Une décision au vocabulaire du client ; livrable non validé ou décision inconnue : 404. */
  async adr(scope: ProjectScope, adrId: string): Promise<ClientSpaceAdr> {
    orNotFound((await this.validation(scope)) === "validated" ? true : null);
    return clientAdrOf(await this.adrsOf.adr(scope, { adrId }));
  }

  async archFlows(
    scope: ProjectScope,
    input: { q?: string; cursor?: string; around?: string; limit?: number },
  ): Promise<ClientSpaceArchFlows> {
    const validation = await this.validation(scope);
    if (validation !== "validated") return { available: false, validation, items: [], ...NO_PAGE };
    const page = await this.diagram.flows(scope, {
      ...input,
      projectId: scope.projectId,
      limit: Math.min(input.limit ?? PAGE_MAX, PAGE_MAX),
    });
    return { available: true, validation, ...page };
  }

  /** La séquence d'un flux ; livrable non validé ou flux inconnu : 404. */
  async archFlow(scope: ProjectScope, flowId: string): Promise<ClientSpaceArchFlow> {
    orNotFound((await this.validation(scope)) === "validated" ? true : null);
    return clientArchFlowOf(await this.diagram.flow(scope, { flowId }));
  }
}
