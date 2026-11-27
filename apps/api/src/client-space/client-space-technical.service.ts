import type {
  ClientSpaceTechnical,
  ClientSpaceTechnicalDocument,
  ClientSpaceTechnicalEnvironments,
  ClientSpaceTechnicalStack,
} from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { SpecDeliverablesService } from "../spec-deliverables/spec-deliverables.service.ts";
import { SpecTechnicalService } from "../spec-technical/spec-technical.service.ts";
import { clientStackChoice } from "../spec-technical/technical-values.ts";
import type { ProjectScope } from "../tracker/scope.ts";

type Validation = ClientSpaceTechnical["validation"];

const NO_PAGE = { nextCursor: null, previousCursor: null, offset: 0, total: 0 } as const;
const NO_COUNTS = { choices: 0, operations: 0, requirements: 0, environments: 0 } as const;

/**
 * Cahier technique validé, vu du client (TK-115, B725, B726). Rien n'est montré tant que l'équipe n'a pas validé le livrable
 * (ou s'il est « À revoir ») : `available` faux, aucun contenu. Aucune écriture (les questions passent par
 * `comment.create`) ; jamais de YAML, de chemin ni de SHA.
 */
@Injectable()
export class ClientSpaceTechnicalService {
  constructor(
    @Inject(SpecDeliverablesService) private readonly deliverables: SpecDeliverablesService,
    @Inject(SpecTechnicalService) private readonly technical: SpecTechnicalService,
  ) {}

  /** Statut du livrable Technique au contenu courant ; jamais de propositions (rôle fermé par défaut). */
  private async validation(scope: ProjectScope): Promise<Validation> {
    const { deliverables } = await this.deliverables.list(scope, undefined);
    const status = deliverables.find((entry) => entry.key === "technical")?.status;
    if (status === "validated") return "validated";
    return status === "revise" ? "to_revise" : "to_validate";
  }

  async summary(scope: ProjectScope): Promise<ClientSpaceTechnical> {
    const validation = await this.validation(scope);
    if (validation !== "validated") return { available: false, validation, counts: NO_COUNTS };
    const counts = await this.technical.counts(scope);
    return {
      available: true,
      validation,
      counts: {
        choices: counts.stack,
        operations: counts.endpoints,
        requirements: counts.nfr,
        environments: counts.environments,
      },
    };
  }

  async stack(
    scope: ProjectScope,
    input: { q?: string; cursor?: string; around?: string; limit?: number },
  ): Promise<ClientSpaceTechnicalStack> {
    const validation = await this.validation(scope);
    if (validation !== "validated") return { available: false, validation, items: [], ...NO_PAGE };
    const { q, cursor, around, limit } = input;
    const page = await this.technical.stackList(scope, { q, cursor, around, limit });
    return { available: true, validation, ...page, items: page.items.map(clientStackChoice) };
  }

  async environments(scope: ProjectScope): Promise<ClientSpaceTechnicalEnvironments> {
    const validation = await this.validation(scope);
    if (validation !== "validated") {
      return { available: false, validation, environments: [], variables: [], integrations: [] };
    }
    const { commitSha: _commit, ...content } = await this.technical.environments(scope, {});
    return { available: true, validation, ...content };
  }

  async document(scope: ProjectScope): Promise<ClientSpaceTechnicalDocument> {
    const validation = await this.validation(scope);
    if (validation !== "validated") return { available: false, validation, sections: [] };
    const { sections } = await this.technical.sections(scope, { deliverable: "technical" });
    return {
      available: true,
      validation,
      sections: sections.map(({ specId, num, title, status, markdown }) => ({
        specId,
        num,
        title,
        status,
        markdown,
      })),
    };
  }
}
