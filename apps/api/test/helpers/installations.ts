import { randomUUID } from "node:crypto";
import type { Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { expect } from "vitest";
import { createSeededDatabase, TEST_AUTH_URL } from "./app.ts";
import { ManualClock } from "./leases.ts";
import type { Actor } from "./organizations.ts";
import { createRepoApp, installAuditFailTrigger, ProviderHarness } from "./repos.ts";
import { createWorld, send, type World } from "./tickets.ts";

/**
 * Banc des tests d'installation (TK-48a2). Contrat attendu de la production :
 *  - `installation.list` / `installation.start` (contrat 0.7.0), owner/admin ;
 *  - `GET /api/github/callback` : route Nest brute, hors oRPC et hors OpenAPI, session par cookie ;
 *    toute réponse est `303` vers `/github?result=<outcome>` (jamais d'écho d'une entrée) ;
 *  - `redirect_uri` transmis à GitHub = `<BETTER_AUTH_URL>/api/github/callback` ;
 *  - `installation.start` sans identifiants client, sans clé de chiffrement ou sans fournisseur :
 *    503 `PROVIDER_UNAVAILABLE` ; au plus 20 états non consommés et non expirés par utilisateur
 *    (21e : 422 `VALIDATION{field: "installationId", message: "too_many_pending"}`) ;
 *  - `provider_auth_states.created_at` et `expires_at` sont posés à partir de l'horloge de l'application
 *    (jamais `now()` de la base : le CHECK de TTL de 10 minutes et la consommation doivent suivre `CLOCK`) ;
 *  - audit : `installation.start` (cible organisation), `installation.link` et
 *    `installation.reauthorize` (cible installation), `installation.link_refused` (cible organisation,
 *    seulement quand l'organisation est établie par un état signé valide).
 */
export const CALLBACK_PATH = "/api/github/callback";
export const REDIRECT_URI = `${TEST_AUTH_URL}${CALLBACK_PATH}`;
export const INSTALL_APP = {
  appId: "1234",
  privateKey: "cle-privee-non-utilisee-avec-le-faux",
  clientId: "Iv1.client-id-de-test",
  clientSecret: "client-secret-de-test-0123456789",
};
export const ENCRYPTION_KEY = Buffer.from("0123456789abcdefABCDEFghijklmnop", "utf8");
export const OTHER_ENCRYPTION_KEY = Buffer.from("zyxwvutsrqponmlkZYXWVUTSRQPONMLK", "utf8");
export const START_TTL_MS = 10 * 60 * 1000;

export type Outcome =
  | "installed"
  | "denied"
  | "invalid_state"
  | "already_linked"
  | "provider_error";

export interface InstallBench {
  database: TestDatabase;
  app: INestApplication;
  clock: ManualClock;
  harness: ProviderHarness;
  /** Lignes de journal émises par l'application (niveau info). */
  lines: string[];
}

export type Bench = () => InstallBench;

export async function createInstallApp(
  database: TestDatabase,
  harness: ProviderHarness | null,
  clock: ManualClock,
  over: Partial<Parameters<typeof createRepoApp>[1]> = {},
  lines: string[] = [],
): Promise<INestApplication> {
  return createRepoApp(database.url, {
    clock,
    ...(harness ? { provider: harness.provider } : {}),
    githubApp: INSTALL_APP,
    encryptionKey: ENCRYPTION_KEY,
    logStream: { write: (line: string) => void lines.push(line) },
    ...over,
  });
}

export function installationBench(hooks: {
  beforeAll: (fn: () => Promise<void>) => void;
  afterAll: (fn: () => Promise<void>) => void;
  beforeEach: (fn: () => Promise<void>) => void;
}): Bench {
  let bench: InstallBench | undefined;
  hooks.beforeAll(async () => {
    const database = await createSeededDatabase();
    const clock = new ManualClock();
    const harness = await ProviderHarness.create(clock);
    harness.watchTransactions(database);
    await installAuditFailTrigger(database);
    const lines: string[] = [];
    const app = await createInstallApp(database, harness, clock, {}, lines);
    bench = { database, app, clock, harness, lines };
  });
  hooks.afterAll(async () => {
    await bench?.app.close();
    await bench?.database.dispose();
  });
  hooks.beforeEach(async () => {
    if (!bench) return;
    bench.harness.reset();
    bench.lines.length = 0;
    await bench.database.query("DELETE FROM audit_fail");
  });
  return () => {
    if (!bench) throw new Error("banc de test non initialisé (beforeAll a échoué)");
    return bench;
  };
}

let counter = 0;

export interface Scene {
  world: World;
  /** Compte GitHub de l'utilisateur `owner` (le faux accepte `fake-code-<login>`). */
  login: string;
  /** Installation visible de ce compte chez GitHub. */
  github: { externalId: string; ownerKind: "organization" | "user"; ownerLogin: string };
  owner: Actor;
  admin: Actor;
}

/** Monde Koklo + compte GitHub dont le jeton voit une installation. */
export async function installScene(
  b: InstallBench,
  over: { ownerKind?: "organization" | "user" } = {},
): Promise<Scene> {
  const n = ++counter;
  const world = await createWorld(b.database);
  const login = `gh-user-${n}`;
  const github = {
    externalId: `${7_000_000 + n}`,
    ownerKind: over.ownerKind ?? ("organization" as const),
    ownerLogin: over.ownerKind === "user" ? login : `acme-gh-${n}`,
  };
  b.harness.inner.seedUserInstallation(login, github);
  return { world, login, github, owner: world.actors.owner, admin: world.actors.admin };
}

/**
 * Second flux pour la même installation : chez le faux un code `fake-code-<login>` est à usage unique
 * et lié à son login, un nouveau flux passe donc par un autre compte GitHub qui voit la même installation.
 */
export function reseed(b: InstallBench, s: Scene): Scene {
  const login = `${s.login}-r${++counter}`;
  b.harness.inner.seedUserInstallation(login, s.github);
  return { ...s, login };
}

export const codeOf = (login: string): string => `fake-code-${login}`;

export const startInstall = (
  b: InstallBench,
  actor: Pick<Actor, "cookie"> | undefined,
  installationId?: string,
) =>
  send(
    b.app,
    actor?.cookie,
    "post",
    "/provider/installations/start",
    installationId === undefined ? {} : { installationId },
  );

export const listInstallations = (b: InstallBench, actor: Pick<Actor, "cookie"> | undefined) =>
  send(b.app, actor?.cookie, "get", "/provider/installations");

export const stateOf = (url: string): string => new URL(url).searchParams.get("state") ?? "";

/** Démarre un flux et rend l'état signé de l'URL (échoue si `start` ne répond pas 200). */
export async function startState(
  b: InstallBench,
  actor: Pick<Actor, "cookie">,
  installationId?: string,
): Promise<string> {
  const res = await startInstall(b, actor, installationId);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return stateOf(res.body.url);
}

export type Query = Record<string, string | undefined> | [string, string][];

/** Navigation du navigateur vers le callback : jamais de redirection suivie. */
export function callback(app: INestApplication, cookie: string | undefined, query: Query) {
  const pairs = Array.isArray(query)
    ? query
    : Object.entries(query).filter((e): e is [string, string] => e[1] !== undefined);
  const qs = new URLSearchParams(pairs).toString();
  const req = request(app.getHttpServer()).get(`${CALLBACK_PATH}${qs ? `?${qs}` : ""}`);
  return cookie ? req.set("Cookie", cookie) : req;
}

/** Retour nominal de GitHub après une installation. */
export function githubReturn(
  s: Scene,
  state: string,
  over: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    installation_id: s.github.externalId,
    code: codeOf(s.login),
    state,
    setup_action: "install",
    ...over,
  };
}

/** 303 vers la cible fixe, sans aucune valeur reçue dans l'URL (redirection ouverte impossible). */
export function expectOutcome(
  res: { status: number; headers: Record<string, string> },
  outcome: Outcome,
) {
  expect(res.status).toBe(303);
  expect(res.headers.location).toBe(`/github?result=${outcome}`);
}

export interface InstallationRow {
  id: string;
  organization_id: string;
  external_id: string;
  owner_kind: string;
  owner_login: string;
  status: string;
}

export const installationRows = (database: TestDatabase, organizationId?: string) =>
  database.query<InstallationRow>(
    `SELECT id, organization_id, external_id, owner_kind::text AS owner_kind, owner_login, status::text AS status
       FROM provider_installations
      WHERE ($1::uuid IS NULL OR organization_id = $1::uuid) ORDER BY created_at, id`,
    [organizationId ?? null],
  );

export const installationByExternal = (database: TestDatabase, externalId: string) =>
  database.query<InstallationRow>(
    `SELECT id, organization_id, external_id, owner_kind::text AS owner_kind, owner_login, status::text AS status
       FROM provider_installations WHERE external_id = $1`,
    [externalId],
  );

export interface CredentialRow {
  id: string;
  organization_id: string;
  user_id: string;
  installation_id: string;
  ciphertext: Buffer;
  nonce: Buffer;
  key_version: number;
  expires_at: Date;
  refresh_expires_at: Date | null;
}

export const credentialRows = (database: TestDatabase, organizationId?: string) =>
  database.query<CredentialRow>(
    `SELECT id, organization_id, user_id, installation_id, ciphertext, nonce, key_version, expires_at, refresh_expires_at
       FROM provider_user_credentials
      WHERE ($1::uuid IS NULL OR organization_id = $1::uuid) ORDER BY created_at, id`,
    [organizationId ?? null],
  );

export interface StateRow {
  id: string;
  organization_id: string;
  user_id: string;
  installation_id: string | null;
  nonce: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

export const stateRows = (database: TestDatabase, organizationId: string) =>
  database.query<StateRow>(
    `SELECT id, organization_id, user_id, installation_id, nonce, expires_at, consumed_at, created_at
       FROM provider_auth_states WHERE organization_id = $1 ORDER BY created_at, id`,
    [organizationId],
  );

/** Insère un état directement (fixture de purge et de plafond) ; `createdAtIso` peut dater le passé. */
export async function insertStateRow(
  database: TestDatabase,
  organizationId: string,
  userId: string,
  over: { createdAtIso?: string; ttlMs?: number; consumed?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  const created = Date.parse(over.createdAtIso ?? new Date().toISOString());
  await database.query(
    `INSERT INTO provider_auth_states (id, organization_id, user_id, nonce, expires_at, consumed_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [
      id,
      organizationId,
      userId,
      `nonce-${id}`,
      new Date(created + (over.ttlMs ?? START_TTL_MS)).toISOString(),
      over.consumed ? new Date(created + 1000).toISOString() : null,
      new Date(created).toISOString(),
    ],
  );
  return id;
}

export interface AuditEntry {
  action: string;
  target_kind: string;
  target_id: string;
  actor_kind: string;
  actor_id: string | null;
}

export const installationAudit = (database: TestDatabase, organizationId: string) =>
  database.query<AuditEntry>(
    `SELECT action, target_kind, target_id, actor_kind, actor_id
       FROM audit_log WHERE organization_id = $1 AND action LIKE 'installation.%' ORDER BY occurred_at, id`,
    [organizationId],
  );

/** Aucune écriture : ni installation, ni jeton chiffré (pour l'organisation donnée). */
export async function expectNothingLinked(database: TestDatabase, organizationId: string) {
  expect(await installationRows(database, organizationId)).toEqual([]);
  expect(await credentialRows(database, organizationId)).toEqual([]);
}

export const providerCalls = (b: InstallBench, ...names: string[]) =>
  b.harness.calls.filter((call) => names.includes(call.method));

export const ROLES_DENIED: Role[] = ["dev", "designer", "client", "business"];
