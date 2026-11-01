import { randomUUID } from "node:crypto";
import type { Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import {
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  revealLlmCredential,
} from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { AiLimits } from "../../src/ai/ai-budget.ts";
import { NONCE_SOURCE, type NonceSource } from "../../src/ai/nonce.ts";
import { LLM_PROVIDERS } from "../../src/llm/tokens.ts";
import { createSeededDatabase } from "./app.ts";
import { ENCRYPTION_KEY } from "./installations.ts";
import { ManualClock } from "./leases.ts";
import { makeSentinel } from "./llm-credentials.ts";
import type { Actor } from "./organizations.ts";
import type { RepoBench } from "./repo-scene.ts";
import {
  createRepoApp,
  installAuditFailTrigger,
  ProviderHarness,
  TestCredentialsStore,
} from "./repos.ts";
import { createWorld, send, type World } from "./tickets.ts";

/**
 * Banc des tests `ai.*` et `llmCredential.verify` (TK-54b, contrat 0.9.0). Contrat attendu de la
 * production :
 *  - jeton `LLM_PROVIDERS` (`src/llm/tokens.ts`, `Map<LlmProviderId, LlmProvider>`) et jeton
 *    `NONCE_SOURCE` (`src/ai/nonce.ts`, `{ next(): string }`), surchargés ici par `overrideProvider` ;
 *  - `AppConfig.ai?: Partial<AiLimits>` ; routes `POST /projects/{projectId}/ai/{brief|features|criteria}`
 *    et `POST /llm-credentials/{provider}/verify` ;
 *  - AUCUN réseau : le fournisseur est un `FakeLlm` (ou un double de test) placé sous la clé `anthropic`.
 */
export const PROVIDER = "anthropic";
export const AI_ROUTES = {
  draftBrief: (projectId: string) => `/projects/${projectId}/ai/brief`,
  proposeFeatures: (projectId: string) => `/projects/${projectId}/ai/features`,
  proposeCriteria: (projectId: string) => `/projects/${projectId}/ai/criteria`,
  verify: (provider = PROVIDER) => `/llm-credentials/${provider}/verify`,
} as const;
export const AI_ACTIONS = {
  draftBrief: "ai.brief.draft",
  proposeFeatures: "ai.features.propose",
  proposeCriteria: "ai.criteria.propose",
  verify: "llm_credential.verify",
} as const;

/** Limites larges du banc : seuls les tests de quota les resserrent (applications dédiées). */
export const WIDE_LIMITS: AiLimits = {
  maxCallsPerHourOrg: 1000,
  maxCallsPerHourUser: 1000,
  maxVerifyPerHourOrg: 1000,
  maxConcurrentPerOrg: 10,
};

/** Nonces déterministes, uniques par appel (48 hexadécimaux) ; tout appel de `next()` est compté. */
export class ScriptedNonces implements NonceSource {
  issued: string[] = [];
  private queue: string[] = [];
  private counter = 0;

  push(...nonces: string[]): void {
    this.queue.push(...nonces);
  }

  next(): string {
    const nonce = this.queue.shift() ?? (++this.counter).toString(16).padStart(48, "0");
    this.issued.push(nonce);
    return nonce;
  }

  reset(): void {
    this.issued = [];
    this.queue = [];
    this.counter = 0;
  }
}

/** Fournisseur enregistré sous la clé `anthropic` : délègue au double courant du test. */
export class SwitchableProvider implements LlmProvider {
  readonly id = "anthropic" as const;
  target: LlmProvider = new FakeLlm();
  /** Clés (déchiffrées) reçues par le double : seule trace de ce que le service a révélé. */
  keysSeen: string[] = [];

  complete(request: LlmRequest): Promise<LlmResponse> {
    this.keysSeen.push(revealLlmCredential(request.credential));
    return this.target.complete(request);
  }
}

/** Double bloquant : `complete` attend `release()`, ce qui permet de mesurer la concurrence. */
export class GatedLlm implements LlmProvider {
  readonly id = "fake" as const;
  started = 0;
  finished = 0;
  /** Appelé au début de chaque `complete` (par exemple pour lire la base en cours d'appel). */
  onCall: ((request: LlmRequest) => Promise<void> | void) | undefined;
  private open: () => void = () => undefined;
  private gate: Promise<void>;

  constructor(private readonly inner: FakeLlm) {
    this.gate = new Promise((resolve) => {
      this.open = resolve;
    });
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.started += 1;
    try {
      await this.onCall?.(request);
      await this.gate;
      return await this.inner.complete(request);
    } finally {
      this.finished += 1;
    }
  }

  release(): void {
    this.open();
  }

  async untilStarted(count: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (this.started < count) {
      if (Date.now() > deadline) throw new Error(`seulement ${this.started} appels démarrés`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

/** Modèle simulé qui répond une sortie valide selon la finalité (scénarios d'audit : jamais le réseau). */
export class PurposeLlm implements LlmProvider {
  readonly id = "fake" as const;

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const replies: Record<string, unknown> = {
      "brief-draft": BRIEF_REPLY,
      "features-propose": featuresReply(),
      "criteria-propose": criteriaReply(),
      "credential-verify": "OK",
    };
    const reply = replies[request.trace.purpose];
    return FakeLlm.replying(reply).complete(request);
  }
}

export interface AiBench extends RepoBench {
  provider: SwitchableProvider;
  nonces: ScriptedNonces;
  /** Journaux (niveau info) de l'application principale. */
  lines: string[];
  /** Application sans porte-clés (`KOKLO_ENCRYPTION_KEY` absente). */
  appWithoutKey: INestApplication;
  /** Remplace le double courant ; remis à un `FakeLlm` neuf avant chaque test. */
  use(provider: LlmProvider): void;
  /** Application supplémentaire sur la même base (limites resserrées, autre clé), fermée en fin de fichier. */
  makeApp(over?: {
    limits?: Partial<AiLimits>;
    encryptionKey?: Buffer | null;
    clock?: ManualClock;
    logStream?: { write: (line: string) => void };
    /** Ne surcharge pas `LLM_PROVIDERS` : câblage de production. */
    defaultRegistry?: boolean;
  }): Promise<INestApplication>;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
export function installAiBench(hooks: {
  beforeAll: (fn: () => Promise<void>, timeout?: number) => void;
  afterAll: (fn: () => Promise<void>, timeout?: number) => void;
  beforeEach: (fn: () => Promise<void>) => void;
}): () => AiBench {
  let bench: AiBench | undefined;
  const extras: INestApplication[] = [];
  hooks.beforeAll(async () => {
    const database = await createSeededDatabase();
    const clock = new ManualClock();
    const harness = await ProviderHarness.create(clock);
    harness.watchTransactions(database);
    await installAuditFailTrigger(database);
    const credentials = new TestCredentialsStore();
    const provider = new SwitchableProvider();
    const nonces = new ScriptedNonces();
    const lines: string[] = [];
    const build = (over: Parameters<AiBench["makeApp"]>[0] = {}) =>
      createRepoApp(database.url, {
        clock: over.clock ?? clock,
        provider: harness.provider,
        credentials,
        ...(over.encryptionKey === null
          ? {}
          : { encryptionKey: over.encryptionKey ?? ENCRYPTION_KEY }),
        logStream: over.logStream ?? { write: (line: string) => void lines.push(line) },
        config: { ai: { ...WIDE_LIMITS, ...(over.limits ?? {}) } },
        configure: (builder) => {
          const withNonces = builder.overrideProvider(NONCE_SOURCE).useValue(nonces);
          // `defaultRegistry` : le registre de production (adaptateur Anthropic, `fetch` global).
          return over.defaultRegistry
            ? withNonces
            : withNonces.overrideProvider(LLM_PROVIDERS).useValue(new Map([[PROVIDER, provider]]));
        },
      });
    const app = await build();
    const appWithoutKey = await build({ encryptionKey: null });
    bench = {
      database,
      app,
      appWithoutKey,
      clock,
      harness,
      credentials,
      provider,
      nonces,
      lines,
      use: (next) => {
        provider.target = next;
      },
      makeApp: async (over) => {
        const created = await build(over);
        extras.push(created);
        return created;
      },
    };
  }, 180_000);
  hooks.afterAll(async () => {
    for (const app of extras) await app.close();
    await bench?.app.close();
    await bench?.appWithoutKey.close();
    await bench?.database.dispose();
  }, 60_000);
  hooks.beforeEach(async () => {
    if (!bench) return;
    bench.harness.reset();
    bench.provider.target = new FakeLlm();
    bench.provider.keysSeen = [];
    bench.nonces.reset();
    bench.lines.length = 0;
    await bench.database.query("DELETE FROM audit_fail");
  });
  return () => {
    if (!bench) throw new Error("banc de test non initialisé (beforeAll a échoué)");
    return bench;
  };
}

/** Monde avec une clé BYOK `anthropic` posée par l'owner ; `key` est la sentinelle factice. */
export async function keyedWorld(
  b: AiBench,
  options: { defaultModel?: string; app?: INestApplication } = {},
): Promise<{ world: World; key: string }> {
  const world = await createWorld(b.database);
  const key = makeSentinel();
  await setKey(options.app ?? b.app, world, key, options.defaultModel);
  return { world, key };
}

export async function setKey(
  app: INestApplication,
  world: World,
  key: string,
  defaultModel?: string,
): Promise<void> {
  const res = await send(app, world.actors.owner.cookie, "put", `/llm-credentials/${PROVIDER}`, {
    provider: PROVIDER,
    apiKey: key,
    ...(defaultModel === undefined ? {} : { defaultModel }),
  });
  if (res.status !== 200) throw new Error(`set : ${JSON.stringify(res.body)}`);
}

/** Client HTTP des quatre procédures (cookie de session, en-têtes facultatifs). */
export function aiApi(
  app: INestApplication,
  actor: Pick<Actor, "cookie"> | undefined,
  headers: Record<string, string> = {},
) {
  const post = (path: string, body: Record<string, unknown>) => {
    const req = request(app.getHttpServer()).post(path);
    if (actor?.cookie) req.set("Cookie", actor.cookie);
    for (const [name, value] of Object.entries(headers)) req.set(name, value);
    return req.send(body);
  };
  return {
    draftBrief: (projectId: string, over: Record<string, unknown> = {}) =>
      post(AI_ROUTES.draftBrief(projectId), {
        projectId,
        idea: "Une application de suivi",
        ...over,
      }),
    proposeFeatures: (projectId: string, over: Record<string, unknown> = {}) =>
      post(AI_ROUTES.proposeFeatures(projectId), {
        projectId,
        brief: "Un brief de projet",
        ...over,
      }),
    proposeCriteria: (projectId: string, over: Record<string, unknown> = {}) =>
      post(AI_ROUTES.proposeCriteria(projectId), { projectId, specId: "F-001", ...over }),
    verify: (provider = PROVIDER) => post(AI_ROUTES.verify(provider), { provider }),
    raw: post,
  };
}

// --- Réponses simulées du modèle ---
export const STEPS = [
  { type: "etant_donne", text: "un visiteur connecté" },
  { type: "quand", text: "il ouvre la page" },
  { type: "alors", text: "la liste s'affiche" },
] as const;
export const CRITERION = { title: "Affichage de la liste", steps: [...STEPS] };
export const modelFeature = (over: Record<string, unknown> = {}) => ({
  title: "Liste des tickets",
  priority: "should",
  description: "Afficher les tickets du projet.",
  criteria: [CRITERION],
  ...over,
});
export const featuresReply = (...features: Record<string, unknown>[]) => ({
  features: features.length === 0 ? [modelFeature()] : features,
});
export const BRIEF_REPLY = {
  title: "Suivi de projet",
  problem: "Les équipes perdent la trace des demandes.",
  users: "Chefs de projet et développeurs.",
  expectedOutcome: "Une vue unique de l'avancement.",
  constraints: "Livraison en un trimestre.",
  openQuestions: ["Quel outil actuel ?"],
};
export const criteriaReply = (...criteria: Record<string, unknown>[]) => ({
  criteria: criteria.length === 0 ? [CRITERION] : criteria,
});

// --- Lectures de la base ---
export interface AuditLine {
  action: string;
  target_kind: string;
  target_id: string;
  actor_id: string | null;
  occurred_at: Date;
}

export function aiAuditRows(database: TestDatabase, organizationId: string): Promise<AuditLine[]> {
  return database.query<AuditLine>(
    `SELECT action, target_kind, target_id, actor_id, occurred_at FROM audit_log
      WHERE organization_id = $1 AND (action LIKE 'ai.%' OR action = 'llm_credential.verify')
      ORDER BY occurred_at, id`,
    [organizationId],
  );
}

export function allAuditText(database: TestDatabase, organizationId: string): Promise<string> {
  return database
    .query<{ text: string }>("SELECT a::text AS text FROM audit_log a WHERE organization_id = $1", [
      organizationId,
    ])
    .then((rows) => rows.map((row) => row.text).join("\n"));
}

/** Compteurs des tables qu'une proposition ne doit jamais toucher. */
export async function writeCounters(database: TestDatabase, organizationId: string) {
  const one = async (sql: string) =>
    Number((await database.query<{ n: number }>(sql, [organizationId]))[0]?.n ?? -1);
  return {
    batches: await one(
      "SELECT count(*)::int AS n FROM spec_write_batches WHERE organization_id = $1",
    ),
    operations: await one(
      "SELECT count(*)::int AS n FROM spec_write_operations WHERE organization_id = $1",
    ),
    tickets: await one("SELECT count(*)::int AS n FROM tickets WHERE organization_id = $1"),
    features: await one("SELECT count(*)::int AS n FROM spec_features WHERE organization_id = $1"),
    snapshots: await one(
      "SELECT count(*)::int AS n FROM spec_snapshots WHERE organization_id = $1",
    ),
    comments: await one(
      "SELECT count(*)::int AS n FROM ticket_comments WHERE organization_id = $1",
    ),
  };
}

export async function lastUsedAt(
  database: TestDatabase,
  organizationId: string,
): Promise<Date | null> {
  const rows = await database.query<{ last_used_at: Date | null }>(
    "SELECT last_used_at FROM llm_provider_credentials WHERE organization_id = $1",
    [organizationId],
  );
  return rows[0]?.last_used_at ?? null;
}

export async function credentialState(database: TestDatabase, organizationId: string) {
  const rows = await database.query<{
    id: string;
    invalidated_at: Date | null;
    last_used_at: Date | null;
  }>(
    "SELECT id, invalidated_at, last_used_at FROM llm_provider_credentials WHERE organization_id = $1",
    [organizationId],
  );
  return rows[0];
}

/** Ligne d'audit insérée à une date choisie (fenêtre glissante des quotas). */
export async function insertAuditAt(
  database: TestDatabase,
  entry: {
    organizationId: string;
    userId: string;
    action: string;
    targetKind: "project" | "llm_credential";
    targetId: string;
    at: Date;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO audit_log (id, organization_id, actor_kind, actor_id, action, target_kind, target_id, occurred_at)
     VALUES ($1, $2, 'human', $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      entry.organizationId,
      entry.userId,
      entry.action,
      entry.targetKind,
      entry.targetId,
      entry.at,
    ],
  );
}

export const ROLE_LIST: Role[] = ["owner", "admin", "dev", "designer", "client", "business"];

/** Aplatit une valeur (clés, valeurs, `cause`, non énumérables) pour y chercher une sentinelle. */
export function flatten(value: unknown, seen = new Set<unknown>()): string {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || seen.has(value)) return String(value ?? "");
  seen.add(value);
  const own = Reflect.ownKeys(value).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return `${String(key)}=${flatten(descriptor?.value, seen)}`;
  });
  return own.join("\n");
}
