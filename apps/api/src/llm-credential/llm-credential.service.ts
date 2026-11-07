import {
  LLM_CREDENTIAL_MAX_LENGTH,
  type LlmProviderId,
  llmCredential,
  llmProviderTraits,
} from "@koklo/domain";
import { assertSafeBaseUrl, UnsafeBaseUrlError } from "@koklo/llm";
import { type Clock, systemClock } from "../clock.ts";
import type { TokenCipher } from "../crypto/token-cipher.ts";
import type { AuditActor } from "../tracker/audit.ts";
import type { LlmCredentialRepository, LlmCredentialStatus } from "./llm-credential.repository.ts";
import { llmCredentialAad } from "./llm-credential-aad.ts";
import {
  EncryptionUnavailableError,
  LlmCredentialInputError,
  type LlmCredentialUnavailableReason,
} from "./llm-credential-errors.ts";

export interface SetLlmCredentialInput {
  readonly apiKey: string;
  readonly defaultModel?: string;
  /** Obligatoire pour `openai_compatible`, refusée pour tout autre fournisseur. */
  readonly baseUrl?: string;
  readonly createdByUserId?: string;
  /** Action d'audit propre à l'appelant (`ai_provider.add`…), à la place de `llm_credential.*`. */
  readonly auditAction?: string;
}

/** Même borne que le CHECK SQL de `default_model`, comptée en points de code (`char_length`). */
const MODEL_MAX_LENGTH = 100;

/** Valide la clé avec la règle du domaine (celle des CHECK) ; l'erreur ne reprend jamais la valeur. */
function assertApiKey(apiKey: string): void {
  try {
    llmCredential(apiKey);
  } catch {
    // Cause écartée : seule la raison générale remonte.
    throw new LlmCredentialInputError(
      "apiKey",
      `1 à ${LLM_CREDENTIAL_MAX_LENGTH} caractères, sans caractère de contrôle`,
    );
  }
}

function assertModel(model: string): void {
  const length = [...model].length;
  if (length < 1 || length > MODEL_MAX_LENGTH || model.includes("/") || model.includes("..")) {
    throw new LlmCredentialInputError(
      "defaultModel",
      `1 à ${MODEL_MAX_LENGTH} caractères, sans « / » ni « .. »`,
    );
  }
}

/**
 * Adresse de base : réservée au fournisseur qui l'exige, passée par la garde anti-SSRF (https seul, ni
 * adresse privée ni nom local). Rend la forme normalisée. Le message ne reprend jamais l'adresse saisie.
 */
export function normalizedBaseUrl(
  provider: LlmProviderId,
  baseUrl: string | undefined,
): string | null {
  const required = llmProviderTraits(provider).baseUrlRequired;
  if (!required) {
    if (baseUrl === undefined) return null;
    throw new LlmCredentialInputError("baseUrl", "non applicable à ce fournisseur");
  }
  if (baseUrl === undefined) throw new LlmCredentialInputError("baseUrl", "adresse obligatoire");
  try {
    return assertSafeBaseUrl(baseUrl).toString();
  } catch (error) {
    if (error instanceof UnsafeBaseUrlError) {
      throw new LlmCredentialInputError("baseUrl", "adresse https publique obligatoire");
    }
    throw error;
  }
}

/** Valide clé, modèle et adresse (mêmes règles que `set`) ; rend l'adresse normalisée (ou `null`). */
export function checkedCredentialInput(
  provider: LlmProviderId,
  input: Pick<SetLlmCredentialInput, "apiKey" | "defaultModel" | "baseUrl">,
): string | null {
  assertApiKey(input.apiKey);
  if (input.defaultModel !== undefined) assertModel(input.defaultModel);
  return normalizedBaseUrl(provider, input.baseUrl);
}

/**
 * Gestion des clés BYOK d'une organisation. `cipher` null : aucun porte-clés configuré, `set` lève
 * `EncryptionUnavailableError` avant tout accès ; `list`, `remove` et `invalidate` fonctionnent.
 */
export class LlmCredentialService {
  constructor(
    private readonly repository: LlmCredentialRepository,
    private readonly cipher: TokenCipher | null,
    private readonly clock: Clock = systemClock,
  ) {}

  /** `actor` : l'utilisateur de la session, journalisé dans la transaction de l'écriture. */
  async set(
    organizationId: string,
    provider: LlmProviderId,
    input: SetLlmCredentialInput,
    actor?: AuditActor,
  ): Promise<LlmCredentialStatus> {
    if (this.cipher === null) throw new EncryptionUnavailableError();
    const baseUrl = checkedCredentialInput(provider, input);
    const { status } = await this.repository.upsert(
      organizationId,
      {
        provider,
        secret: this.cipher.encrypt(input.apiKey, llmCredentialAad(organizationId, provider)),
        defaultModel: input.defaultModel ?? null,
        baseUrl,
        createdByUserId: input.createdByUserId ?? actor?.userId ?? null,
        ...(input.auditAction === undefined ? {} : { auditAction: input.auditAction }),
        at: this.clock.now(),
      },
      actor,
    );
    return status;
  }

  list(organizationId: string): Promise<LlmCredentialStatus[]> {
    return this.repository.list(organizationId);
  }

  /**
   * Pourquoi le moteur n'a trouvé aucune clé utilisable : aucune clé (`missing`), toutes invalidées
   * (`invalidated`), pas de porte-clés (`no-encryption-key`), sinon une clé valide illisible (`undecryptable`).
   * Diagnostic seulement : ne déchiffre rien.
   */
  async unavailabilityOf(organizationId: string): Promise<LlmCredentialUnavailableReason> {
    const statuses = await this.repository.list(organizationId);
    if (statuses.length === 0) return "missing";
    if (statuses.every((status) => status.invalid)) return "invalidated";
    return this.cipher === null ? "no-encryption-key" : "undecryptable";
  }

  remove(
    organizationId: string,
    provider: LlmProviderId,
    actor?: AuditActor,
    auditAction?: string,
  ): Promise<boolean> {
    return this.repository.remove(organizationId, provider, actor, auditAction);
  }

  /** Lève `EncryptionUnavailableError` sans porte-clés : permet de refuser AVANT un test de clé. */
  assertCanStore(): void {
    if (this.cipher === null) throw new EncryptionUnavailableError();
  }

  invalidate(
    organizationId: string,
    provider: LlmProviderId,
    actor?: AuditActor,
    // Compare-and-swap (D7) : valeur de `ResolvedLlmCredential.revision` lue avant l'appel au modèle.
    expectedRevision?: string,
  ): Promise<LlmCredentialStatus | null> {
    return this.repository.invalidate(
      organizationId,
      provider,
      this.clock.now(),
      actor,
      expectedRevision,
    );
  }

  markUsed(organizationId: string, provider: LlmProviderId): Promise<void> {
    return this.repository.markUsed(organizationId, provider, this.clock.now());
  }
}
