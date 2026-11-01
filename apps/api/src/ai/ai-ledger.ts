import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { systemClock } from "../clock.ts";
import type { AppConfig } from "../config.ts";
import { APP_CONFIG, DatabaseService } from "../database/database.module.ts";
import { type AuditActor, type AuditEntry, recordAudit } from "../tracker/audit.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import { AI_LIMIT_DEFAULTS, AI_WINDOW_SECONDS, type AiLimits } from "./ai-budget.ts";
import { rateLimited } from "./ai-errors.ts";

/** Quota d'un appel : les lignes d'audit comptées et les plafonds qui s'y appliquent. */
export type QuotaKind = "ai" | "verify";

interface Scope {
  readonly action: { startsWith: string } | { equals: string };
  readonly actorId?: string;
  readonly limit: number;
}

const WINDOW_MS = AI_WINDOW_SECONDS * 1000;

/**
 * Quotas et audit des appels au modèle. Les compteurs sont des lignes du journal d'audit (aucun état
 * en mémoire : valable à plusieurs instances) ; le comptage et l'écriture de la ligne partagent une
 * transaction, sérialisée par organisation dans le processus. Le journal est horodaté par la base : la fenêtre se mesure à l'horloge système, pas à
 * l'horloge injectable de l'application.
 */
@Injectable()
export class AiLedger {
  readonly limits: AiLimits;
  readonly #queues = new Map<string, Promise<void>>();

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) config: Pick<AppConfig, "ai">,
  ) {
    this.limits = { ...AI_LIMIT_DEFAULTS, ...config.ai };
  }

  /**
   * Refuse (429 `LLM_RATE_LIMITED`, aucune ligne écrite) si un plafond est atteint ; sinon écrit la
   * ligne d'audit de l'appel, AVANT l'appel au modèle. Le réseau n'est jamais dans cette transaction.
   */
  admit(actor: AuditActor, kind: QuotaKind, entry: AuditEntry): Promise<void> {
    return this.serialized(actor.organizationId, () => this.admitNow(actor, kind, entry));
  }

  private admitNow(actor: AuditActor, kind: QuotaKind, entry: AuditEntry): Promise<void> {
    return withOrganization(actor.organizationId, () =>
      this.database.client.$transaction(async (tx) => {
        const waits = await Promise.all(
          this.scopesOf(kind, actor.userId).map((scope) => this.waitFor(tx, scope)),
        );
        const wait = Math.max(0, ...waits);
        if (wait > 0) throw rateLimited(wait);
        await recordAudit(tx, actor, entry);
      }),
    );
  }

  /**
   * Une admission à la fois par organisation et par processus : le comptage et l'écriture ne se
   * chevauchent pas. Entre instances, le dépassement possible est borné par le nombre d'instances
   * (la base interdit les requêtes brutes sur le client multi-tenant, donc pas de verrou consultatif).
   */
  private async serialized<T>(organizationId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.#queues.get(organizationId) ?? Promise.resolve();
    const run = previous.then(work, work);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.#queues.set(organizationId, tail);
    try {
      return await run;
    } finally {
      if (this.#queues.get(organizationId) === tail) this.#queues.delete(organizationId);
    }
  }

  private scopesOf(kind: QuotaKind, userId: string): Scope[] {
    if (kind === "verify") {
      return [
        { action: { equals: "llm_credential.verify" }, limit: this.limits.maxVerifyPerHourOrg },
      ];
    }
    return [
      { action: { startsWith: "ai." }, limit: this.limits.maxCallsPerHourOrg },
      { action: { startsWith: "ai." }, actorId: userId, limit: this.limits.maxCallsPerHourUser },
    ];
  }

  /** Secondes à attendre avant qu'une place se libère ; 0 si le plafond n'est pas atteint. */
  private async waitFor(tx: Tx, scope: Scope): Promise<number> {
    const now = new Date(systemClock.now()).getTime();
    const where = {
      action: scope.action,
      occurredAt: { gt: new Date(now - WINDOW_MS) },
      ...(scope.actorId === undefined ? {} : { actorId: scope.actorId }),
    };
    const count = await tx.auditLog.count({ where });
    if (count < scope.limit) return 0;
    // La place s'ouvre quand sort la ligne qui ramène le compte sous le plafond.
    const blocking = await tx.auditLog.findFirst({
      where,
      orderBy: { occurredAt: "asc" },
      skip: count - scope.limit,
      select: { occurredAt: true },
    });
    const leavesAt = (blocking?.occurredAt.getTime() ?? now) + WINDOW_MS;
    return Math.min(AI_WINDOW_SECONDS, Math.max(1, Math.ceil((leavesAt - now) / 1000)));
  }
}
