import {
  type installationCallbackOutcomeSchema,
  installationCallbackQuerySchema,
} from "@koklo/contract";
import {
  type GitProvider,
  type GitUserCredentials,
  type GitUserInstallation,
  InvalidUserCodeError,
} from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import { CLOCK, type Clock } from "../clock.ts";
import { requestLogger } from "../request-logger.ts";
import type { AuditActor } from "../tracker/audit.ts";
import { INSTALLATION_REPOSITORY, type InstallationRepository } from "./installation.repository.ts";
import { INSTALLATION_FLOW, type InstallationFlow } from "./installation-flow.ts";

export type CallbackOutcome = z.output<typeof installationCallbackOutcomeSchema>;
type CallbackQuery = z.output<typeof installationCallbackQuerySchema>;

/**
 * Retour de GitHub après l'installation ou la ré-autorisation. Une installation n'est liée que si le
 * jeton de l'utilisateur la voit ET que cet utilisateur en est le propriétaire (son compte personnel,
 * ou administrateur actif de l'organisation GitHub) : `GET /user/installations` liste aussi les
 * installations des organisations dont il est seulement membre. L'identifiant reçu dans la requête
 * n'est jamais une preuve. Le résultat est un énuméré, sans valeur reçue ni message du fournisseur.
 *
 * Ordre : session, configuration, état signé, consommation atomique en base, et SEULEMENT ensuite
 * l'échange du code (le code d'un attaquant ne doit jamais servir avec la session d'une victime).
 */
@Injectable()
export class InstallationCallbackService {
  constructor(
    @Inject(INSTALLATION_REPOSITORY) private readonly repository: InstallationRepository,
    @Inject(INSTALLATION_FLOW) private readonly flow: InstallationFlow | null,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async complete(userId: string | null, rawQuery: unknown): Promise<CallbackOutcome> {
    if (userId === null) return "invalid_state";
    const flow = this.flow;
    if (!flow) return "provider_error";
    const query = installationCallbackQuerySchema.safeParse(rawQuery);
    const claim = query.success ? flow.signer.verify(query.data.state) : null;
    if (!query.success || !claim || claim.userId !== userId) return "invalid_state";
    const actor = { organizationId: claim.organizationId, userId };
    const consumed = await this.repository.consumeState(
      { ...actor, nonce: claim.nonce },
      this.clock.now(),
    );
    if (!consumed) return "invalid_state";
    // Organisation de l'état, jamais celle de la session au retour : on revérifie le rôle.
    if (!(await this.repository.isManager(actor))) return "denied";
    return this.finish(flow, actor, consumed.installationId, query.data);
  }

  private async finish(
    flow: InstallationFlow,
    actor: AuditActor,
    installationId: string | null,
    query: CallbackQuery,
  ): Promise<CallbackOutcome> {
    const target = await this.targetOf(actor, installationId, query);
    if (target === "invalid_state") return target;
    if (target === null || query.code === undefined) return this.refuse(actor, "denied");
    return this.prove(flow, actor, target, query.code);
  }

  /** Échange du code puis preuve : installation visible du jeton de l'utilisateur, dont il est propriétaire. */
  private async prove(
    flow: InstallationFlow,
    actor: AuditActor,
    target: string,
    code: string,
  ): Promise<CallbackOutcome> {
    let credentials: GitUserCredentials;
    try {
      credentials = await flow.provider.exchangeUserCode({ code, redirectUri: flow.redirectUri });
    } catch (error) {
      if (error instanceof InvalidUserCodeError) return this.refuse(actor, "denied");
      return this.failed(error);
    }
    try {
      const visible = await flow.provider.listUserInstallations({
        auth: { kind: "user", ...credentials },
      });
      const proven = visible.find((candidate) => candidate.externalId === target);
      if (!proven) return this.refuse(actor, "denied");
      if (!(await ownsAccount(flow.provider, credentials, proven))) {
        return this.refuse(actor, "not_owner");
      }
      const result = await this.repository.link(actor, proven, credentials);
      return result === "already_linked" ? this.refuse(actor, "already_linked") : "installed";
    } catch (error) {
      return this.failed(error);
    }
  }

  /**
   * Identifiant fournisseur à prouver : celui de l'installation de l'état (ré-autorisation) ou celui
   * de la requête (première installation). `null` : rien à lier ; `invalid_state` : la requête
   * contredit l'état.
   */
  private async targetOf(
    actor: AuditActor,
    installationId: string | null,
    query: CallbackQuery,
  ): Promise<string | null | "invalid_state"> {
    if (installationId === null) return query.installation_id ?? null;
    const known = await this.repository.findInstallation(actor.organizationId, installationId);
    if (!known || known.status === "deleted") return null;
    if (query.installation_id !== undefined && query.installation_id !== known.externalId) {
      return "invalid_state";
    }
    return known.externalId;
  }

  /** Le refus est journalisé (sans identifiant externe) ; une panne du journal ne change pas le résultat. */
  private async refuse(actor: AuditActor, outcome: "denied" | "already_linked" | "not_owner") {
    try {
      await this.repository.recordRefusal(actor);
    } catch (error) {
      this.failed(error);
    }
    return outcome;
  }

  /** Seul le nom de l'erreur est journalisé : son message peut citer un code, un état ou un jeton. */
  private failed(error: unknown): CallbackOutcome {
    requestLogger().warn(
      { errorName: error instanceof Error ? error.name : "erreur" },
      "installation callback failed",
    );
    return "provider_error";
  }
}

/** Seuls le compte personnel lui-même et un administrateur actif de l'organisation prouvent la propriété. */
async function ownsAccount(
  provider: GitProvider,
  credentials: GitUserCredentials,
  installation: GitUserInstallation,
): Promise<boolean> {
  const role = await provider.getUserOwnerRole({
    auth: { kind: "user", ...credentials },
    owner: { kind: installation.ownerKind, login: installation.ownerLogin },
  });
  return installation.ownerKind === "user" ? role === "self" : role === "admin";
}
