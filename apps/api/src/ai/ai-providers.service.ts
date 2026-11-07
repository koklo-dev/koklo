import type { AiProviderItemOutput } from "@koklo/contract";
import { type LlmProviderId, llmCredential } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import type { LlmCredentialStatus } from "../llm-credential/llm-credential.repository.ts";
import {
  checkedCredentialInput,
  LlmCredentialService,
} from "../llm-credential/llm-credential.service.ts";
import { notFound, validation } from "../tracker/api-errors.ts";
import type { AuditActor } from "../tracker/audit.ts";
import { AiService } from "./ai.service.ts";
import { AiCallRunner, correlationIdOf } from "./ai-call.ts";
import { verifyPrompt } from "./ai-prompts.ts";
import { alreadyConfigured, providerItemOf } from "./ai-providers-api.ts";
import { AiSettingsService } from "./ai-settings.service.ts";
import { PrismaAiRoutingStore } from "./prisma-ai-routing-store.ts";

/** Saisie d'une clé : le modèle sert au test, il n'est conservé que s'il tient dans la colonne (pas de « / »). */
export interface ProviderKeyInput {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
}

const storableModel = (model: string | undefined): string | undefined =>
  model === undefined || model.includes("/") ? undefined : model;

/**
 * Fournisseurs d'IA d'une organisation (TK-98) : la clé est TESTÉE avant d'être enregistrée (B122) ; un
 * test échoué ne laisse ni clé, ni réglage, ni audit d'ajout. Le premier fournisseur devient principal, le
 * deuxième secours (B124). Le principal ne se retire pas. Chaque écriture porte une ligne d'audit
 * `ai_provider.*`, sans clé ni adresse.
 */
@Injectable()
export class AiProvidersService {
  constructor(
    @Inject(LlmCredentialService) private readonly credentials: LlmCredentialService,
    @Inject(AiCallRunner) private readonly runner: AiCallRunner,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AiSettingsService) private readonly settings: AiSettingsService,
    @Inject(PrismaAiRoutingStore) private readonly routing: PrismaAiRoutingStore,
  ) {}

  async list(organizationId: string): Promise<AiProviderItemOutput[]> {
    const [statuses, routing] = await Promise.all([
      this.credentials.list(organizationId),
      this.routing.load(organizationId),
    ]);
    return statuses.map((status) => providerItemOf(status, routing));
  }

  async add(
    actor: AuditActor,
    requestId: string,
    provider: LlmProviderId,
    input: ProviderKeyInput,
  ): Promise<AiProviderItemOutput> {
    const existing = await this.statusOf(actor.organizationId, provider);
    if (existing !== null) throw alreadyConfigured();
    return this.store(actor, requestId, provider, input, "ai_provider.add");
  }

  async replaceKey(
    actor: AuditActor,
    requestId: string,
    provider: LlmProviderId,
    input: ProviderKeyInput,
  ): Promise<AiProviderItemOutput> {
    const existing = await this.found(actor.organizationId, provider);
    // La clé remplacée garde son modèle et son adresse tant que la saisie n'en donne pas d'autres.
    const kept: ProviderKeyInput = {
      ...input,
      ...(input.baseUrl === undefined && existing.baseUrl !== null
        ? { baseUrl: existing.baseUrl }
        : {}),
    };
    return this.store(actor, requestId, provider, kept, "ai_provider.replaceKey", existing);
  }

  async verify(actor: AuditActor, requestId: string, provider: LlmProviderId) {
    await this.found(actor.organizationId, provider);
    return this.ai.verify(actor, provider, requestId);
  }

  async remove(actor: AuditActor, provider: LlmProviderId): Promise<void> {
    await this.found(actor.organizationId, provider);
    const { primary } = await this.routing.load(actor.organizationId);
    if (primary === provider) throw validation("provider", "is_primary");
    if (
      !(await this.credentials.remove(actor.organizationId, provider, actor, "ai_provider.remove"))
    ) {
      throw notFound();
    }
  }

  async setPrimary(actor: AuditActor, provider: LlmProviderId): Promise<AiProviderItemOutput> {
    const status = await this.found(actor.organizationId, provider);
    if (status.invalid) throw validation("provider", "clé invalide");
    await this.settings.setPrimary(actor, provider);
    return this.itemOf(actor.organizationId, provider);
  }

  /** Valide, teste, puis écrit : le test précède toute écriture. */
  private async store(
    actor: AuditActor,
    requestId: string,
    provider: LlmProviderId,
    input: ProviderKeyInput,
    auditAction: string,
    existing?: LlmCredentialStatus,
  ): Promise<AiProviderItemOutput> {
    const { organizationId } = actor;
    this.credentials.assertCanStore();
    const defaultModel = storableModel(input.model) ?? existing?.defaultModel ?? undefined;
    const baseUrl = checkedCredentialInput(provider, {
      apiKey: input.apiKey,
      ...(defaultModel === undefined ? {} : { defaultModel }),
      ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
    });
    await this.runner.probe({
      purpose: "credential-verify",
      provider,
      actor,
      correlationId: correlationIdOf(requestId),
      quota: "verify",
      output: { kind: "text" },
      credential: llmCredential(input.apiKey),
      ...(baseUrl === null ? {} : { baseUrl }),
      ...(input.model === undefined ? {} : { model: input.model }),
      entry: () => ({
        action: "llm_credential.verify",
        targetKind: "organization",
        targetId: organizationId,
      }),
      frame: verifyPrompt,
      settle: () => undefined,
    });
    await this.credentials.set(
      organizationId,
      provider,
      {
        apiKey: input.apiKey,
        ...(defaultModel === undefined ? {} : { defaultModel }),
        ...(baseUrl === null ? {} : { baseUrl }),
        auditAction,
      },
      actor,
    );
    await this.credentials.markUsed(organizationId, provider);
    if (existing === undefined) await this.settings.assignNewProvider(actor, provider);
    return this.itemOf(organizationId, provider);
  }

  private async itemOf(organizationId: string, provider: LlmProviderId) {
    const [status, routing] = await Promise.all([
      this.found(organizationId, provider),
      this.routing.load(organizationId),
    ]);
    return providerItemOf(status, routing);
  }

  private async statusOf(organizationId: string, provider: LlmProviderId) {
    const all = await this.credentials.list(organizationId);
    return all.find((status) => status.provider === provider) ?? null;
  }

  /** La clé de ce fournisseur, ou `NOT_FOUND` (absente ou d'une autre organisation, sans distinction). */
  private async found(organizationId: string, provider: LlmProviderId) {
    const status = await this.statusOf(organizationId, provider);
    if (status === null) throw notFound();
    return status;
  }
}
