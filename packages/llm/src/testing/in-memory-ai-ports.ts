import {
  type AiCredentialSource,
  type AiEvent,
  type AiEventSink,
  type AiMonthConsumption,
  type AiRouting,
  type AiRoutingStore,
  type AiUsageMeter,
  type LlmProviderId,
  llmCredential,
  type QualifiedModel,
  type QualifiedModelCatalog,
  type ResolvedCredential,
} from "@koklo/domain";

/** Réglages en mémoire, identiques pour toute organisation. */
export class InMemoryRoutingStore implements AiRoutingStore {
  routing: AiRouting;
  constructor(routing: AiRouting) {
    this.routing = routing;
  }
  async load(): Promise<AiRouting> {
    return this.routing;
  }
}

export interface InMemoryKey {
  readonly secret: string;
  readonly baseUrl?: string | undefined;
  readonly defaultModel?: string | undefined;
  readonly revision?: string | undefined;
}

/** Source de clés en mémoire ; garde l'ordre des résolutions demandées. */
export class InMemoryCredentialSource implements AiCredentialSource {
  readonly resolved: LlmProviderId[] = [];
  readonly #keys: Partial<Record<string, InMemoryKey>>;
  constructor(keys: Partial<Record<string, InMemoryKey>>) {
    this.#keys = keys;
  }
  async resolve(
    _organizationId: string,
    provider: LlmProviderId,
  ): Promise<ResolvedCredential | undefined> {
    this.resolved.push(provider);
    const key = this.#keys[provider];
    if (key === undefined) {
      return undefined;
    }
    return {
      credential: llmCredential(key.secret),
      ...(key.baseUrl === undefined ? {} : { baseUrl: key.baseUrl }),
      ...(key.defaultModel === undefined ? {} : { defaultModel: key.defaultModel }),
      ...(key.revision === undefined ? {} : { revision: key.revision }),
    };
  }
}

export interface MeterEntry {
  readonly organizationId: string;
  readonly provider: LlmProviderId;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicroUsd: number;
}

export interface InMemoryUsageMeterOptions {
  readonly costMicroUsd?: number | undefined;
  readonly warned?: boolean | undefined;
  readonly now?: (() => Date) | undefined;
}

const monthOf = (date: Date): string => date.toISOString().slice(0, 7);

/** Compteur en mémoire : mois UTC, un marqueur d'alerte par mois, échec programmable. */
export class InMemoryUsageMeter implements AiUsageMeter {
  readonly entries: MeterEntry[] = [];
  failing = false;
  readonly #now: () => Date;
  readonly #base = new Map<string, number>();
  readonly #warned = new Set<string>();
  readonly #months: string[] = [];

  constructor(options: InMemoryUsageMeterOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    const month = monthOf(this.#now());
    this.#base.set(month, options.costMicroUsd ?? 0);
    if (options.warned) {
      this.#warned.add(month);
    }
  }

  async month(): Promise<AiMonthConsumption> {
    const month = monthOf(this.#now());
    const recorded = this.entries
      .filter((_, index) => this.#months[index] === month)
      .reduce((sum, e) => sum + e.costMicroUsd, 0);
    return {
      costMicroUsd: (this.#base.get(month) ?? 0) + recorded,
      warnedThisMonth: this.#warned.has(month),
    };
  }

  async markCapWarned(): Promise<boolean> {
    const month = monthOf(this.#now());
    const first = !this.#warned.has(month);
    this.#warned.add(month);
    return first;
  }

  async record(entry: MeterEntry): Promise<void> {
    if (this.failing) {
      throw new Error("compteur en panne");
    }
    this.entries.push(entry);
    this.#months.push(monthOf(this.#now()));
  }

  /** Cumul du mois courant pour un fournisseur. */
  totals(provider: LlmProviderId) {
    const rows = this.entries.filter((e) => e.provider === provider);
    return {
      calls: rows.length,
      inputTokens: rows.reduce((sum, e) => sum + e.inputTokens, 0),
      outputTokens: rows.reduce((sum, e) => sum + e.outputTokens, 0),
      costMicroUsd: rows.reduce((sum, e) => sum + e.costMicroUsd, 0),
    };
  }
}

/** Journal en mémoire ; `failing` simule une panne. */
export class RecordingEvents implements AiEventSink {
  readonly events: AiEvent[] = [];
  failing = false;
  emit(event: AiEvent): void {
    if (this.failing) {
      throw new Error("journal en panne");
    }
    this.events.push(event);
  }
}

export const qualifiedCatalog = (models: readonly QualifiedModel[]): QualifiedModelCatalog => ({
  list: () => models,
});
