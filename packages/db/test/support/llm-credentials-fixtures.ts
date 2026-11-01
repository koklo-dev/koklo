import { randomUUID } from "node:crypto";
import type { TestDatabase } from "../../src/testing/test-database.ts";
import { insertScope, type Scope } from "./ticket-fixtures.ts";

/** Table ajoutée par TK-51a (identifiants BYOK chiffrés, un par organisation et fournisseur). */
export const LLM_TABLES = ["llm_provider_credentials"] as const;
export const LLM_MODELS = ["LlmProviderCredential"] as const;

export const LLM_SUFFIX = "_llm_provider_credentials";
export const LLM_MIGRATION = "20261101090000_llm_provider_credentials";
export const LLM_TABLE = "llm_provider_credentials";

/** Colonnes exactes de la table : aucune colonne AAD, aucune colonne de clé en clair. */
export const LLM_COLUMNS = {
  ciphertext: "bytea/NO",
  created_at: "timestamptz/NO",
  created_by_user_id: "uuid/YES",
  default_model: "text/YES",
  id: "uuid/NO",
  invalidated_at: "timestamptz/YES",
  key_version: "int4/NO",
  last_used_at: "timestamptz/YES",
  nonce: "bytea/NO",
  organization_id: "uuid/NO",
  provider: "llm_provider/NO",
  updated_at: "timestamptz/NO",
} as const;

/** Convention d'AAD (dérivée de la ligne, jamais stockée) : `llm:v1:<organization_id>:<provider>`. */
export const aadOf = (organizationId: string, provider: string): string =>
  `llm:v1:${organizationId}:${provider}`;

export async function llmScope(db: TestDatabase, label: string): Promise<Scope> {
  return insertScope(db, label);
}

export interface LlmCredentialOverrides {
  organizationId: string;
  provider?: string;
  ciphertext?: Buffer;
  nonce?: Buffer;
  keyVersion?: number;
  defaultModel?: string | null;
  createdByUserId?: string | null;
}

export async function insertLlmCredential(
  db: TestDatabase,
  o: LlmCredentialOverrides,
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO llm_provider_credentials (id, organization_id, provider, ciphertext, nonce,
       key_version, default_model, created_by_user_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
    [
      id,
      o.organizationId,
      o.provider ?? "anthropic",
      o.ciphertext ?? Buffer.alloc(40, 3),
      o.nonce ?? Buffer.alloc(12, 5),
      o.keyVersion ?? 1,
      o.defaultModel === undefined ? null : o.defaultModel,
      o.createdByUserId === undefined ? null : o.createdByUserId,
    ],
  );
  return id;
}
