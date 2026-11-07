import type { AiUsage } from "./ai-usage.ts";
import type { LlmBudget } from "./llm-budget.ts";
import type { LlmCredential } from "./llm-credential.ts";
import type { FramedPrompt } from "./llm-prompt.ts";
import type { LlmStreamEvent } from "./llm-provider.ts";
import type { LlmProviderId } from "./llm-provider-id.ts";
import type { LlmOutputSpec, LlmResponse, LlmTrace } from "./llm-request.ts";

/** Appel d'IA du produit : un usage, jamais un fournisseur ni un modèle (le moteur les résout). */
export interface AiRequest {
  readonly organizationId: string;
  /** Utilisateur à l'origine de l'appel, si connu : il signe les lignes d'audit du moteur (jamais un contenu). */
  readonly userId?: string;
  readonly usage: AiUsage;
  /** Données à traiter en UE : écarte les fournisseurs non éligibles (A5, par appel). */
  readonly euOnly: boolean;
  readonly prompt: FramedPrompt;
  readonly output: LlmOutputSpec;
  readonly budget: LlmBudget;
  readonly temperature?: number;
  readonly signal?: AbortSignal;
  readonly trace: LlmTrace;
}

/** Réponse : `provider` et `model` sont ceux réellement servis (secours compris). */
export type AiResponse = LlmResponse & { readonly provider: LlmProviderId };

export interface AiProvider {
  /**
   * Contrôle préalable, sans appel au modèle ni comptage : plafond atteint ou aucun fournisseur utilisable
   * (le moteur lève alors ses erreurs). Permet à l'appelant de refuser avant d'écrire son audit ou son quota.
   */
  preflight(request: AiRequest): Promise<void>;
  complete(request: AiRequest): Promise<AiResponse>;
  stream(request: AiRequest): AsyncIterable<LlmStreamEvent>;
}

export interface AiUsageModel {
  readonly provider: LlmProviderId;
  readonly model: string;
}

/** Réglages d'une organisation lus par le moteur. */
export interface AiRouting {
  readonly primary?: LlmProviderId;
  readonly fallback?: LlmProviderId;
  readonly fallbackEnabled: boolean;
  readonly usageModels: Readonly<Partial<Record<AiUsage, AiUsageModel>>>;
  /** Fournisseurs dont une clé valide existe (non retirée, non invalidée). */
  readonly availableProviders: readonly LlmProviderId[];
  /** Plafond mensuel en micro-dollars ; absent = pas de plafond (A1). */
  readonly monthlyCapMicroUsd?: number;
}

export interface AiRoutingStore {
  load(organizationId: string): Promise<AiRouting>;
}

export interface ResolvedCredential {
  readonly credential: LlmCredential;
  readonly baseUrl?: string;
  readonly defaultModel?: string;
  /** Révision de la clé stockée (opaque) : compare-and-swap du rejet d'une clé. */
  readonly revision?: string;
}

/** Seule porte vers une clé : n'est injectée que dans le moteur et le service de clés. */
export interface AiCredentialSource {
  resolve(organizationId: string, provider: LlmProviderId): Promise<ResolvedCredential | undefined>;
}

export interface AiMonthConsumption {
  readonly costMicroUsd: number;
  readonly warnedThisMonth: boolean;
}

export interface AiUsageMeter {
  /** Consommation du mois UTC courant, tous fournisseurs confondus. */
  month(organizationId: string): Promise<AiMonthConsumption>;
  /** Pose le marqueur d'alerte du mois ; vrai pour le seul appelant qui l'a posé (atomique). */
  markCapWarned(organizationId: string): Promise<boolean>;
  record(entry: {
    readonly organizationId: string;
    readonly provider: LlmProviderId;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costMicroUsd: number;
  }): Promise<void>;
}

/**
 * Vie des clés, signalée par le moteur (seul à savoir quel fournisseur a réellement servi). Meilleur
 * effort : une panne est ignorée par le moteur. `rejected` n'est appelé que sur un 401 explicite.
 */
export interface AiKeyHooks {
  used(event: { readonly organizationId: string; readonly provider: LlmProviderId }): Promise<void>;
  rejected(event: {
    readonly organizationId: string;
    readonly provider: LlmProviderId;
    readonly revision?: string;
    readonly userId?: string;
  }): Promise<void>;
}

export interface QualifiedModel {
  readonly provider: LlmProviderId;
  readonly model: string;
  readonly usages: readonly AiUsage[];
  /** Modèle économique (étiquette de l'écran, TK-98). */
  readonly economy: boolean;
}

export interface QualifiedModelCatalog {
  list(): readonly QualifiedModel[];
}

/** Raisons (fermées) d'une bascule : jamais de texte libre ni de contenu. */
export type AiFallbackReason = "auth" | "rate_limited" | "quota" | "unavailable" | "timeout";

/** Événements du moteur destinés au journal d'audit : sans contenu, sans clé, sans modèle. */
export type AiEvent =
  | {
      readonly type: "llm.fallback";
      readonly organizationId: string;
      readonly usage: AiUsage;
      readonly from: LlmProviderId;
      readonly to: LlmProviderId;
      readonly reason: AiFallbackReason;
      readonly userId?: string;
    }
  | { readonly type: "ai.cap_warning"; readonly organizationId: string; readonly userId?: string };

export interface AiEventSink {
  emit(event: AiEvent): void | Promise<void>;
}
