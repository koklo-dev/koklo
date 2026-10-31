import { randomUUID } from "node:crypto";
import type { TestDatabase } from "../../src/testing/test-database.ts";
import { insertInstallation } from "./spec-fixtures.ts";
import { insertScope, type Scope } from "./ticket-fixtures.ts";

/** Tables ajoutées par TK-48a1 (états d'installation, jetons utilisateur chiffrés). */
export const OAUTH_TABLES = ["provider_auth_states", "provider_user_credentials"] as const;
export const OAUTH_MODELS = ["ProviderAuthState", "ProviderUserCredential"] as const;

export const STATES_SUFFIX = "_provider_auth_states";
export const CREDENTIALS_SUFFIX = "_provider_user_credentials";

export async function insertUser(db: TestDatabase, label = "u"): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, true, now(), now())`,
    [id, `User ${label}`, `${label}-${id}@koklo.test`],
  );
  return id;
}

export interface OauthScene {
  scope: Scope;
  userId: string;
  installationId: string;
}

export async function oauthScene(db: TestDatabase, label: string): Promise<OauthScene> {
  const scope = await insertScope(db, label);
  const installationId = await insertInstallation(db, scope);
  return { scope, userId: await insertUser(db, label), installationId };
}

export interface StateOverrides {
  nonce?: string;
  installationId?: string | null;
  /** Durée de vie en secondes à partir de `created_at` (défaut 600 = 10 min). */
  ttlSeconds?: number;
  consumed?: boolean;
  organizationId?: string;
  userId?: string;
}

export async function insertState(
  db: TestDatabase,
  scene: OauthScene,
  o: StateOverrides = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO provider_auth_states (id, organization_id, user_id, installation_id, nonce,
       expires_at, consumed_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6::int),
       CASE WHEN $7::boolean THEN now() END, now(), now())`,
    [
      id,
      o.organizationId ?? scene.scope.organizationId,
      o.userId ?? scene.userId,
      o.installationId === undefined ? null : o.installationId,
      o.nonce ?? randomUUID(),
      o.ttlSeconds ?? 600,
      o.consumed ?? false,
    ],
  );
  return id;
}

export interface CredentialOverrides {
  installationId?: string;
  organizationId?: string;
  userId?: string;
  ciphertext?: Buffer;
  nonce?: Buffer;
  keyVersion?: number;
}

export async function insertCredential(
  db: TestDatabase,
  scene: OauthScene,
  o: CredentialOverrides = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO provider_user_credentials (id, organization_id, user_id, installation_id,
       ciphertext, nonce, key_version, expires_at, refresh_expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '8 hours', now() + interval '180 days',
       now(), now())`,
    [
      id,
      o.organizationId ?? scene.scope.organizationId,
      o.userId ?? scene.userId,
      o.installationId ?? scene.installationId,
      o.ciphertext ?? Buffer.alloc(40, 3),
      o.nonce ?? Buffer.alloc(12, 5),
      o.keyVersion ?? 1,
    ],
  );
  return id;
}
