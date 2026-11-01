import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createSeededDatabase } from "./app.ts";
import { ENCRYPTION_KEY } from "./installations.ts";
import { ManualClock } from "./leases.ts";
import type { Actor } from "./organizations.ts";
import { createRepoApp, installAuditFailTrigger } from "./repos.ts";
import { createWorld, send } from "./tickets.ts";

/**
 * Banc des routes BYOK (TK-52b, contrat 0.8.0). Contrat attendu de la production :
 *  - `GET /llm-credentials`, `PUT /llm-credentials/{provider}`, `DELETE /llm-credentials/{provider}`,
 *    `POST /llm-credentials/{provider}/invalidate` ; owner et admin seulement ;
 *  - `Status` = `{ provider, defaultModel?, configured: true, invalid, invalidatedAt?, lastUsedAt?,
 *    createdAt, updatedAt }` : ni id, ni `keyVersion`, ni rien de dérivé de la clé ;
 *  - l'application est montée avec `KOKLO_ENCRYPTION_KEY` (porte-clés v1) ou sans (503).
 */
export const PROVIDER = "anthropic";
export const ROUTE = "/llm-credentials";

export function llmApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    list: () => send(app, cookie, "get", ROUTE),
    set: (provider: string, body: Record<string, unknown>) =>
      send(app, cookie, "put", `${ROUTE}/${provider}`, { provider, ...body }),
    remove: (provider: string) => send(app, cookie, "delete", `${ROUTE}/${provider}`),
    invalidate: (provider: string) =>
      send(app, cookie, "post", `${ROUTE}/${provider}/invalidate`, { provider }),
  };
}

export interface CredentialRow {
  id: string;
  provider: string;
  default_model: string | null;
  key_version: number;
  invalidated_at: Date | null;
  last_used_at: Date | null;
  created_by_user_id: string | null;
}

export function credentialRows(
  database: TestDatabase,
  organizationId: string,
): Promise<CredentialRow[]> {
  return database.query<CredentialRow>(
    `SELECT id, provider::text AS provider, default_model, key_version, invalidated_at, last_used_at, created_by_user_id
       FROM llm_provider_credentials WHERE organization_id = $1 ORDER BY provider`,
    [organizationId],
  );
}

export interface LlmBench {
  database: TestDatabase;
  /** Application avec porte-clés. */
  app: INestApplication;
  /** Application sans `KOKLO_ENCRYPTION_KEY`. */
  appWithoutKey: INestApplication;
  /** Journaux (niveau info) de `app`. */
  lines: string[];
}

export function llmBench(hooks: {
  beforeAll: (fn: () => Promise<void>, timeout?: number) => void;
  afterAll: (fn: () => Promise<void>, timeout?: number) => void;
  beforeEach: (fn: () => Promise<void>) => void;
}): () => LlmBench {
  let bench: LlmBench | undefined;
  hooks.beforeAll(async () => {
    const database = await createSeededDatabase();
    await installAuditFailTrigger(database);
    const lines: string[] = [];
    const clock = new ManualClock();
    const app = await createRepoApp(database.url, {
      clock,
      encryptionKey: ENCRYPTION_KEY,
      logStream: { write: (line: string) => void lines.push(line) },
    });
    const appWithoutKey = await createRepoApp(database.url, { clock });
    bench = { database, app, appWithoutKey, lines };
  }, 180_000);
  hooks.afterAll(async () => {
    await bench?.app.close();
    await bench?.appWithoutKey.close();
    await bench?.database.dispose();
  }, 60_000);
  hooks.beforeEach(async () => {
    if (!bench) return;
    bench.lines.length = 0;
    await bench.database.query("DELETE FROM audit_fail");
  });
  return () => {
    if (!bench) throw new Error("banc de test non initialisé (beforeAll a échoué)");
    return bench;
  };
}

export const worldOf = (b: LlmBench) => createWorld(b.database);

/** Requête brute avec en-tête `Authorization` (jeton d'automatisation) : aucune session par cookie. */
export const withBearer = (
  app: INestApplication,
  method: "get" | "put" | "post" | "delete",
  path: string,
  token: string,
  body?: Record<string, unknown>,
) => {
  const req = request(app.getHttpServer())[method](path).set("Authorization", `Bearer ${token}`);
  return body === undefined ? req : req.send(body);
};
