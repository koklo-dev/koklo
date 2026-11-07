import { withOrganization } from "@koklo/db";
import type { AiEvent, AiEventSink } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { requestLogger } from "../request-logger.ts";
import { recordAudit } from "../tracker/audit.ts";

/**
 * Événements du moteur : la bascule est journalisée (type, usage, fournisseur de départ et d'arrivée,
 * raison fermée : jamais de contenu, de clé ni de modèle) ; l'alerte à 80 % écrit UNE ligne d'audit
 * `ai.cap_warning` (le moteur ne l'émet qu'une fois par organisation et par mois) signée de l'utilisateur
 * de l'appel. Sans utilisateur connu, l'alerte n'est que journalisée.
 */
@Injectable()
export class AuditAiEventSink implements AiEventSink {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async emit(event: AiEvent): Promise<void> {
    if (event.type === "llm.fallback") {
      requestLogger().info(
        {
          event: "llm.fallback",
          usage: event.usage,
          from: event.from,
          to: event.to,
          reason: event.reason,
        },
        "llm fallback",
      );
      return;
    }
    requestLogger().info({ event: "ai.cap_warning" }, "ai monthly cap at 80 percent");
    if (event.userId === undefined) return;
    const actor = { organizationId: event.organizationId, userId: event.userId };
    await withOrganization(event.organizationId, () =>
      this.database.client.$transaction((tx) =>
        recordAudit(tx, actor, {
          action: "ai.cap_warning",
          targetKind: "organization",
          targetId: event.organizationId,
        }),
      ),
    );
  }
}
