import { withOrganization } from "@koklo/db";
import {
  type AiRouting,
  type AiUsage,
  type AiUsageModel,
  isAiUsage,
  type LlmProviderId,
  llmProviderTraits,
  type QualifiedModel,
  type QualifiedModelCatalog,
} from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { type AuditActor, recordAudit } from "../tracker/audit.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import { AI_CATALOG } from "./ai-tokens.ts";
import { PrismaAiRoutingStore } from "./prisma-ai-routing-store.ts";

export const AI_SETTINGS_FIELDS = [
  "primary",
  "fallback",
  "monthlyCap",
  "usage",
  "provider",
  "model",
] as const;
export type AiSettingsField = (typeof AI_SETTINGS_FIELDS)[number];

/** Saisie refusée : le champ et une raison fixe ; jamais la valeur saisie ni un nom de fournisseur. */
export class AiSettingsInputError extends Error {
  readonly field: AiSettingsField;
  constructor(field: AiSettingsField, reason: string) {
    super(reason);
    this.name = "AiSettingsInputError";
    this.field = field;
  }
}

export interface AiProviderState {
  readonly provider: LlmProviderId;
  readonly invalid: boolean;
  /** « Intermédiaire » à l'écran (TK-98) : OpenRouter seul. */
  readonly intermediary: boolean;
  readonly euEligible: boolean;
}

export interface AiSettingsView extends Omit<AiRouting, "availableProviders"> {
  readonly providers: readonly AiProviderState[];
  readonly qualified: readonly QualifiedModel[];
}

interface SettingsPatch {
  primaryProvider?: LlmProviderId | null;
  fallbackProvider?: LlmProviderId | null;
  fallbackEnabled?: boolean;
  monthlyCapMicroUsd?: bigint | null;
  capWarnedMonth?: null;
}

export interface AiProvidersInput {
  /** `null` efface ; absent ne touche pas. */
  readonly primary?: LlmProviderId | null;
  readonly fallback?: LlmProviderId | null;
  readonly fallbackEnabled?: boolean;
}

/**
 * Réglages d'IA d'une organisation (TK-95 ; les routes et l'écran sont TK-98). Tout est validé ici, côté
 * serveur : fournisseurs porteurs d'une clé valide, principal différent du secours, plafond entier
 * strictement positif (B62), modèle choisi dans le catalogue qualifié pour l'usage. Chaque écriture est
 * auditée (`ai_settings.update`) dans la même transaction.
 */
@Injectable()
export class AiSettingsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PrismaAiRoutingStore) private readonly routing: PrismaAiRoutingStore,
    @Inject(AI_CATALOG) private readonly catalog: QualifiedModelCatalog,
  ) {}

  async get(organizationId: string): Promise<AiSettingsView> {
    const { availableProviders: _valid, ...routing } = await this.routing.load(organizationId);
    const keys = await withOrganization(organizationId, () =>
      this.database.client.llmProviderCredential.findMany({
        select: { provider: true, invalidatedAt: true },
        orderBy: { provider: "asc" },
      }),
    );
    return {
      ...routing,
      providers: keys.map((key) => ({
        provider: key.provider,
        invalid: key.invalidatedAt !== null,
        intermediary: llmProviderTraits(key.provider).intermediary,
        euEligible: llmProviderTraits(key.provider).euEligible,
      })),
      qualified: this.catalog.list(),
    };
  }

  async setProviders(actor: AuditActor, input: AiProvidersInput): Promise<void> {
    const current = await this.routing.load(actor.organizationId);
    const primary = input.primary === undefined ? current.primary : (input.primary ?? undefined);
    const fallback =
      input.fallback === undefined ? current.fallback : (input.fallback ?? undefined);
    for (const [field, value] of [
      ["primary", input.primary],
      ["fallback", input.fallback],
    ] as const) {
      if (value != null && !current.availableProviders.includes(value)) {
        throw new AiSettingsInputError(field, "aucune clé valide pour ce fournisseur");
      }
    }
    if (primary !== undefined && primary === fallback) {
      throw new AiSettingsInputError("fallback", "le secours doit différer du principal");
    }
    const data = {
      ...(input.primary === undefined ? {} : { primaryProvider: input.primary }),
      ...(input.fallback === undefined ? {} : { fallbackProvider: input.fallback }),
      ...(input.fallbackEnabled === undefined ? {} : { fallbackEnabled: input.fallbackEnabled }),
    };
    await this.write(actor, (tx) => this.upsertSettings(tx, actor, data));
  }

  /** `null` retire le plafond (pas de suspension, A1) ; un nouveau plafond rouvre l'alerte du mois. */
  async setMonthlyCap(actor: AuditActor, microUsd: number | null): Promise<void> {
    if (microUsd !== null && !(Number.isSafeInteger(microUsd) && microUsd > 0)) {
      throw new AiSettingsInputError("monthlyCap", "entier strictement positif attendu");
    }
    const data = {
      monthlyCapMicroUsd: microUsd === null ? null : BigInt(microUsd),
      capWarnedMonth: null,
    };
    await this.write(actor, (tx) => this.upsertSettings(tx, actor, data));
  }

  async setUsageModel(actor: AuditActor, usage: AiUsage, choice: AiUsageModel): Promise<void> {
    if (!isAiUsage(usage)) throw new AiSettingsInputError("usage", "usage inconnu");
    const qualified = this.catalog
      .list()
      .some(
        (entry) =>
          entry.provider === choice.provider &&
          entry.model === choice.model &&
          entry.usages.includes(usage),
      );
    if (!qualified) {
      throw new AiSettingsInputError("model", "modèle non qualifié pour cet usage");
    }
    const { availableProviders } = await this.routing.load(actor.organizationId);
    if (!availableProviders.includes(choice.provider)) {
      throw new AiSettingsInputError("provider", "aucune clé valide pour ce fournisseur");
    }
    const { organizationId } = actor;
    await this.write(actor, async (tx) => {
      await tx.aiUsageModel.upsert({
        where: { organizationId_usage: { organizationId, usage } },
        create: { organizationId, usage, provider: choice.provider, model: choice.model },
        update: { provider: choice.provider, model: choice.model },
      });
    });
  }

  async clearUsageModel(actor: AuditActor, usage: AiUsage): Promise<void> {
    if (!isAiUsage(usage)) throw new AiSettingsInputError("usage", "usage inconnu");
    await this.write(actor, async (tx) => {
      await tx.aiUsageModel.deleteMany({ where: { usage } });
    });
  }

  private async upsertSettings(tx: Tx, actor: AuditActor, data: SettingsPatch): Promise<void> {
    const { organizationId } = actor;
    await tx.aiOrganizationSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    });
  }

  private write(actor: AuditActor, work: (tx: Tx) => Promise<void>): Promise<void> {
    return withOrganization(actor.organizationId, () =>
      this.database.client.$transaction(async (tx) => {
        await work(tx);
        await recordAudit(tx, actor, {
          action: "ai_settings.update",
          targetKind: "organization",
          targetId: actor.organizationId,
        });
      }),
    );
  }
}
