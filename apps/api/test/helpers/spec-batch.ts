import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { GitProvider, RepoRef } from "@koklo/domain";
import { CaptureMailSender, startWorker, type Worker } from "@koklo/worker";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module.ts";
import type { AppConfig } from "../../src/config.ts";
import { configFor, createSeededDatabase } from "./app.ts";
import { ManualClock } from "./leases.ts";
import { insertInstallation, installAuditFailTrigger, ProviderHarness, repoApi } from "./repos.ts";
import { createWorld, send, type World } from "./tickets.ts";

/**
 * Banc des tests `specBatch.*` (TK-44b). Contrat attendu de la production :
 *  - `AppConfig.specBatchWaitMs?: number` (variable `SPEC_BATCH_WAIT_MS`, défaut 8000, sondage de la base) ;
 *  - `@koklo/worker` : `startWorker(config, { gitProvider, mailSender, logStream, specWrite })` ;
 *    `specWrite = { retryLimit, retryDelaySeconds }` règle les essais de la file `spec-write` ;
 *  - file pg-boss `spec-write` créée par le worker (`key_strict_fifo`), payload `{ batchId }`.
 * Le worker de production tourne ici pour de bon (pg-boss réel, base partagée avec l'API) ; seul le
 * fournisseur git est remplacé par le faux en mémoire, espionné et ralenti à l'écriture.
 */
export const BRANCH = "cadrage";
export const BOT = { name: "Koklo", email: "koklo-bot@users.noreply.invalid" } as const;
export const SPEC_WRITE_QUEUE = "spec-write";

/** Enveloppe du fournisseur : retarde `writeCommit` et mesure les écritures simultanées par branche. */
export class WriteGate {
  delayMs = 0;
  inFlight = new Map<string, number>();
  maxPerBranch = new Map<string, number>();
  maxTotal = 0;
  order: string[] = [];

  wrap(provider: GitProvider): GitProvider {
    return new Proxy(provider, {
      get: (target, name) => {
        const member = Reflect.get(target, name);
        if (name !== "writeCommit" || typeof member !== "function") return member;
        return async (request: { repo: RepoRef; branch: string; message: string }) => {
          const key = `${request.repo.name}:${request.branch}`;
          this.inFlight.set(key, (this.inFlight.get(key) ?? 0) + 1);
          const total = [...this.inFlight.values()].reduce((sum, n) => sum + n, 0);
          this.maxTotal = Math.max(this.maxTotal, total);
          this.maxPerBranch.set(
            key,
            Math.max(this.maxPerBranch.get(key) ?? 0, this.inFlight.get(key) ?? 0),
          );
          this.order.push(request.message);
          try {
            if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
            return await (member as (r: unknown) => Promise<unknown>).call(target, request);
          } finally {
            this.inFlight.set(key, (this.inFlight.get(key) ?? 1) - 1);
          }
        };
      },
    });
  }

  reset(): void {
    this.delayMs = 0;
    this.inFlight.clear();
    this.maxPerBranch.clear();
    this.maxTotal = 0;
    this.order = [];
  }
}

export interface SpecBench {
  database: TestDatabase;
  app: INestApplication;
  clock: ManualClock;
  harness: ProviderHarness;
  gate: WriteGate;
  logs: string[];
  stopWorker(): Promise<void>;
  startWorker(): Promise<void>;
}

export interface SpecBenchOptions {
  /** `SPEC_BATCH_WAIT_MS` de l'application (défaut du banc : 20 s, pour attendre les commits). */
  waitMs?: number;
}

export async function createSpecBatchApp(
  databaseUrl: string,
  options: {
    clock: ManualClock;
    provider: GitProvider | null;
    waitMs?: number;
    logStream?: { write: (line: string) => void };
  },
): Promise<INestApplication> {
  const { CLOCK } = await import("../../src/clock.ts");
  const { GIT_PROVIDER } = await import("../../src/repo/tokens.ts");
  const config = {
    ...configFor({ databaseUrl }),
    logLevel: options.logStream ? "info" : "silent",
    ...(options.waitMs === undefined ? {} : { specBatchWaitMs: options.waitMs }),
  } as AppConfig;
  const app = (
    await Test.createTestingModule({
      imports: [AppModule.forRoot(config, { logStream: options.logStream })],
    })
      .overrideProvider(CLOCK)
      .useValue(options.clock)
      .overrideProvider(GIT_PROVIDER)
      .useValue(options.provider)
      .compile()
  ).createNestApplication();
  await app.init();
  return app;
}

/** Le vrai worker (pg-boss réel) sur la base de test, avec le fournisseur espionné ; démarrable et arrêtable à volonté. */
function workerHandle(
  database: TestDatabase,
  provider: GitProvider,
  logStream: { write: (line: string) => void },
) {
  let worker: Worker | undefined;
  return {
    get running() {
      return worker !== undefined;
    },
    async start() {
      worker = await startWorker(
        {
          databaseUrl: database.url,
          appEnv: "test",
          appVersion: "dev",
          logLevel: "debug",
          sentryDsn: undefined,
          mail: { kind: "capture" },
          webBaseUrl: "http://localhost:3000",
        },
        {
          gitProvider: provider,
          mailSender: new CaptureMailSender(),
          logStream,
          specWrite: { retryLimit: 1, retryDelaySeconds: 1 },
        },
      );
      // Le worker planifie `reconcile` (cron */10, heure réelle) : un tick en plein test ferait lister
      // les dépôts de la base au faux fournisseur et polluerait `harness.calls`. Aucun tick au banc.
      await database.query("TRUNCATE pgboss.schedule");
    },
    async stop() {
      await worker?.stop();
      worker = undefined;
    },
  };
}

async function openBench(options: SpecBenchOptions) {
  const database = await createSeededDatabase();
  const clock = new ManualClock();
  const harness = await ProviderHarness.create(clock);
  harness.watchTransactions(database);
  await installAuditFailTrigger(database);
  const gate = new WriteGate();
  const logs: string[] = [];
  const logStream = { write: (line: string) => void logs.push(line) };
  const worker = workerHandle(database, gate.wrap(harness.provider), logStream);
  await worker.start();
  const app = await createSpecBatchApp(database.url, {
    clock,
    provider: harness.provider,
    waitMs: options.waitMs ?? 20_000,
    logStream,
  });
  const bench: SpecBench = {
    database,
    app,
    clock,
    harness,
    gate,
    logs,
    stopWorker: () => worker.stop(),
    startWorker: () => worker.start(),
  };
  return { bench, worker };
}

export function installSpecBench(
  hooks: {
    beforeAll: (fn: () => Promise<void>) => void;
    afterAll: (fn: () => Promise<void>) => void;
    beforeEach: (fn: () => Promise<void>) => void;
  },
  options: SpecBenchOptions = {},
): () => SpecBench {
  let opened: Awaited<ReturnType<typeof openBench>> | undefined;
  hooks.beforeAll(async () => {
    opened = await openBench(options);
  });
  hooks.afterAll(async () => {
    await opened?.worker.stop();
    await opened?.bench.app.close();
    await opened?.bench.database.dispose();
  });
  hooks.beforeEach(async () => {
    if (!opened) return;
    const { bench, worker } = opened;
    if (!worker.running) await bench.startWorker();
    bench.harness.reset();
    bench.gate.reset();
    bench.logs.length = 0;
    await bench.database.query("DELETE FROM audit_fail");
  });
  return () => {
    if (!opened) throw new Error("banc de test non initialisé (beforeAll a échoué)");
    return opened.bench;
  };
}

/** Client des procédures specBatch.* du contrat 0.5.0 (HTTP réel). */
export function batchApi(app: INestApplication, actor: { cookie: string } | undefined) {
  const cookie = actor?.cookie;
  return {
    submit: (projectId: string, body: Record<string, unknown>) =>
      send(app, cookie, "post", `/projects/${projectId}/spec/batches`, { projectId, ...body }),
    get: (projectId: string, batchId: string) =>
      send(app, cookie, "get", `/projects/${projectId}/spec/batches/${batchId}`),
  };
}

export const createOp = (title: string, over: Record<string, unknown> = {}) => ({
  kind: "feature.create",
  title,
  priority: "must",
  ...over,
});
export const updateOp = (specId: string, patch: Record<string, unknown>) => ({
  kind: "feature.update",
  specId,
  ...patch,
});
export const deleteOp = (specId: string) => ({ kind: "feature.delete", specId });

export const batch = (operations: unknown[], over: Record<string, unknown> = {}) => ({
  idempotencyKey: `k-${randomUUID()}`,
  operations,
  ...over,
});

/** Étapes d'un critère : le contrat les nomme `type`/`text`. */
export const criterion = (title: string) => ({
  title,
  steps: [
    { type: "etant_donne", text: "un contexte" },
    { type: "quand", text: "une action" },
    { type: "alors", text: "un résultat" },
  ],
});

export interface SpecScene {
  world: World;
  installation: { id: string; ownerLogin: string };
  owner: { kind: "organization"; login: string };
  ref: RepoRef;
  repoId: string;
  projectId: string;
}

/**
 * Projet neuf avec son dépôt de spec (par `repo.createSpec`, TK-43) puis deux features de départ
 * sur `cadrage` : F-100 (liée à l'écran S-accueil) et F-101 (sans écran). Journal du fournisseur vidé.
 */
export async function specScene(bench: SpecBench): Promise<SpecScene> {
  const { emitFeatureMarkdown } = await import("@koklo/schema");
  const world = await createWorld(bench.database);
  const installation = await insertInstallation(bench.database, world.organizationId);
  const created = await repoApi(bench.app, world.actors.owner).createSpec(
    world.projectId,
    installation.id,
  );
  if (created.status !== 200) throw new Error(`createSpec : ${JSON.stringify(created.body)}`);
  const owner = { kind: "organization", login: installation.ownerLogin } as const;
  const ref = { owner, name: created.body.name } as RepoRef;
  const feature = (id: string, titre: string, ecrans: string[]) =>
    emitFeatureMarkdown({
      id,
      titre,
      statut: "brouillon",
      priorite: "should",
      tables: [],
      endpoints: [],
      ecrans,
      roles: [],
      regles: [],
      nfr: [],
      description: "",
      criteres: [],
    });
  const screen = JSON.stringify({
    id: "S-accueil",
    features: ["F-100"],
    arbre: { composant: "C-page" },
    etats: [],
  });
  const auth = await bench.harness.authFor(owner);
  await bench.harness.inner.writeCommit({
    auth,
    repo: ref,
    branch: BRANCH,
    author: BOT,
    message: "test: état de départ",
    files: [
      { path: "features/F-100-accueil.md", content: feature("F-100", "Accueil", ["S-accueil"]) },
      { path: "features/F-101-contact.md", content: feature("F-101", "Contact", []) },
      { path: "design/screens/S-accueil.json", content: screen },
    ],
  });
  bench.harness.calls = [];
  const [row] = await bench.database.query<{ id: string }>(
    "SELECT id FROM project_repos WHERE project_id = $1",
    [world.projectId],
  );
  return {
    world,
    installation,
    owner,
    ref,
    repoId: row?.id ?? "",
    projectId: world.projectId,
  };
}

export async function headOf(bench: SpecBench, scene: SpecScene, branch = BRANCH) {
  const { read } = await bench.harness.inspect(scene.ref);
  return (await read("koklo.project.yaml", branch)).ref;
}

export async function commitsOf(bench: SpecBench, scene: SpecScene, branch = BRANCH) {
  const auth = await bench.harness.authFor(scene.owner);
  return bench.harness.inner.listCommits({ auth, repo: scene.ref, ref: branch, limit: 50 });
}

export async function fileOf(bench: SpecBench, scene: SpecScene, path: string, branch = BRANCH) {
  const { read } = await bench.harness.inspect(scene.ref);
  return read(path, branch);
}

export async function filesOf(bench: SpecBench, scene: SpecScene, branch = BRANCH) {
  const auth = await bench.harness.authFor(scene.owner);
  return (await bench.harness.inner.listFiles({ auth, repo: scene.ref, ref: branch })).files.map(
    (file) => file.path,
  );
}

export interface BatchRow {
  id: string;
  project_id: string;
  repo_id: string;
  branch: string;
  status: string;
  idempotency_key: string;
  base_sha: string | null;
  commit_sha: string | null;
  error_code: string | null;
  report: {
    issues: { code: string; severity: string; entityId?: string }[];
    truncated: boolean;
  } | null;
  message: string | null;
  author_user_id: string | null;
  author_role: string | null;
}

export function batchRows(database: TestDatabase, projectId: string): Promise<BatchRow[]> {
  return database.query<BatchRow>(
    `SELECT id, project_id, repo_id, branch, status, idempotency_key, base_sha, commit_sha, error_code,
            report, message, author_user_id, author_role
       FROM spec_write_batches WHERE project_id = $1 ORDER BY enqueued_at, id`,
    [projectId],
  );
}

export function operationRows(database: TestDatabase, batchId: string) {
  return database.query<{
    position: number;
    kind: string;
    target_spec_id: string | null;
    payload: Record<string, unknown>;
  }>(
    "SELECT position, kind, target_spec_id, payload FROM spec_write_operations WHERE batch_id = $1 ORDER BY position",
    [batchId],
  );
}

export async function auditCount(database: TestDatabase, organizationId: string, action: string) {
  const rows = await database.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1 AND action = $2",
    [organizationId, action],
  );
  return rows[0]?.n ?? 0;
}

/** Soumet et exige un lot validé (200) ; rend le corps. */
export async function submitOk(
  bench: SpecBench,
  scene: SpecScene,
  operations: unknown[],
  over: Record<string, unknown> = {},
  role: "owner" | "dev" | "designer" | "admin" = "dev",
) {
  const res = await batchApi(bench.app, scene.world.actors[role]).submit(
    scene.projectId,
    batch(operations, { branch: BRANCH, ...over }),
  );
  if (res.status !== 200) throw new Error(`submit : ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as {
    id: string;
    status: string;
    commitSha: string | null;
    results: { position: number; kind: string; specId: string | null }[];
  };
}

/** Chemin du fichier de la feature `specId` sur la branche (`features/F-nnn-<slug>.md`), ou undefined. */
export async function pathOfFeature(
  bench: SpecBench,
  scene: SpecScene,
  specId: string,
  branch = BRANCH,
): Promise<string | undefined> {
  return (await filesOf(bench, scene, branch)).find((path) =>
    path.startsWith(`features/${specId}-`),
  );
}

/** Feature relue du dépôt (parseur de @koklo/schema). */
export async function featureOf(
  bench: SpecBench,
  scene: SpecScene,
  specId: string,
  branch = BRANCH,
) {
  const { parseFeatureMarkdown } = await import("@koklo/schema");
  const path = await pathOfFeature(bench, scene, specId, branch);
  if (!path) throw new Error(`feature ${specId} absente de ${branch}`);
  const parsed = parseFeatureMarkdown(path, (await fileOf(bench, scene, path, branch)).content);
  if (!parsed.ok) throw new Error(`feature ${specId} illisible`);
  return parsed.value;
}

/** Écrit directement sur une branche du faux (état préexistant du dépôt, hors API). */
export async function commitDirect(
  bench: SpecBench,
  scene: SpecScene,
  files: { path: string; content: string }[],
  branch = BRANCH,
) {
  const auth = await bench.harness.authFor(scene.owner);
  const commit = await bench.harness.inner.writeCommit({
    auth,
    repo: scene.ref,
    branch,
    author: BOT,
    message: "test: état préexistant",
    files,
  });
  bench.harness.calls = [];
  return commit;
}

/** Jobs de la file `spec-write` (tous états) : un lot refusé ne doit en laisser aucun. */
export async function jobCount(database: TestDatabase): Promise<number> {
  const rows = await database.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM pgboss.job WHERE name = $1",
    [SPEC_WRITE_QUEUE],
  );
  return rows[0]?.n ?? 0;
}
