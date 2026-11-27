import type { ClientSpaceSecurity, IncidentContact } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { SpecDeliverablesService } from "../spec-deliverables/spec-deliverables.service.ts";
import { SpecSecurityService } from "../spec-security/spec-security.service.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { PrismaClientSpaceSecurity } from "./prisma-client-space-security.ts";

type Validation = ClientSpaceSecurity["validation"];

/** Le rôle business lit le résumé sans jamais recevoir le contact (B801, B803). */
const WITHOUT_CONTACT = "business";

/**
 * Résumé de la Sécurité vu du client (TK-117, B803). Rien tant que l'équipe n'a pas validé le livrable (ou s'il est « À
 * revoir ») : `available` faux, aucune carte, rien d'autre. Aucun identifiant, chemin, SHA ni YAML ne sort ; les
 * questions passent par `comment.create` (`security_summary`).
 */
@Injectable()
export class ClientSpaceSecurityService {
  constructor(
    @Inject(SpecDeliverablesService) private readonly deliverables: SpecDeliverablesService,
    @Inject(SpecSecurityService) private readonly security: SpecSecurityService,
    @Inject(PrismaClientSpaceSecurity) private readonly repository: PrismaClientSpaceSecurity,
  ) {}

  /** Statut du livrable au contenu courant, lu comme un rôle sans droits (aucun détail amont). */
  private async validation(scope: ProjectScope): Promise<Validation> {
    const { deliverables } = await this.deliverables.list(scope, undefined);
    const status = deliverables.find((entry) => entry.key === "security")?.status;
    if (status === "validated") return "validated";
    return status === "revise" ? "to_revise" : "to_validate";
  }

  async summary(scope: ProjectScope, role: string | undefined): Promise<ClientSpaceSecurity> {
    const validation = await this.validation(scope);
    if (validation !== "validated") return { available: false, validation, cards: [] };
    const { cards } = await this.security.cards(scope);
    const validatedAt = await this.repository.validatedAt(scope);
    const contact = role === WITHOUT_CONTACT ? null : await this.security.contact(scope);
    return {
      available: cards.length > 0,
      validation,
      cards,
      ...(validatedAt === null ? {} : { validatedAt: validatedAt.toISOString() }),
      ...(contact === null ? {} : { contact }),
    };
  }

  setContact(scope: ProjectScope, contact: IncidentContact): Promise<IncidentContact> {
    return this.repository.setContact(scope, contact);
  }
}
