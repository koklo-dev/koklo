import { randomUUID } from "node:crypto";
import { migrateDeploy } from "@koklo/db/testing";
import type { GitOwner, GitProvider, RepoRef } from "@koklo/domain";
import { InMemoryGitProvider } from "@koklo/github/testing";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { vi } from "vitest";
import { type StartWorkerOptions, startWorker, type Worker } from "../../src/worker.ts";
import { startTestPostgres } from "./postgres.ts";

/**
 * Banc des tests d'intégration du job `spec-write` (TK-44b) : Postgres éphémère en tmpfs migré
 * (`startTestPostgres` puis `migrateDeploy`), vrai pg-boss, vrai worker, faux fournisseur espionné.
 *
 * Contrat attendu de la production :
 *  - `src/jobs/spec-write.ts` exporte `SPEC_WRITE_QUEUE = "spec-write"` ;
 *  - file `key_strict_fifo`, job `{ batchId }` envoyé avec `id = batchId` et `singletonKey = "<repoId>:<branche>"` ;
 *  - `startWorker(config, { gitProvider, specWrite: { retryLimit, retryDelaySeconds } })` ;
 *  - `WorkerConfig.githubApp?: { appId, privateKey, clientId?, clientSecret? }`.
 */
export const SPEC_WRITE_QUEUE = "spec-write";
export const BOT = { name: "Koklo", email: "koklo-bot@users.noreply.invalid" } as const;
export const MANIFEST =
  'projet: "demo"\norganisation: "acme"\nspec_version: 1\nextends: []\nrepos: []\n';

export interface Call {
  method: string;
  request: Record<string, unknown>;
  failed: boolean;
}

/** Fournisseur de test : le faux en mémoire, espionné, qui sait échouer et se laisser suspendre. */
export class SpyProvider {
  readonly inner = new InMemoryGitProvider({
    now: () => new Date(),
    nextId: () => `id${randomUUID().slice(0, 8)}`,
  });
  calls: Call[] = [];
  /** Échec programmé par méthode ; `times` : nombre d'appels qui échouent (Infinity : toujours). */
  failures = new Map<string, { error: unknown; times: number }>();
  /** Suspend l'appel de la méthode jusqu'à la fin de la promesse rendue. */
  hooks = new Map<string, (request: Record<string, unknown>) => Promise<void>>();
  readonly provider: GitProvider = new Proxy({} as GitProvider, {
    get: (_target, name) => {
      if (typeof name !== "string" || typeof Reflect.get(this.inner, name) !== "function") {
        return undefined;
      }
      return async (request: Record<string, unknown>) => {
        const call: Call = { method: name, request, failed: false };
        this.calls.push(call);
        await this.hooks.get(name)?.(request);
        const failure = this.failures.get(name);
        if (failure && failure.times > 0) {
          failure.times -= 1;
          call.failed = true;
          throw failure.error;
        }
        const target = this.inner as unknown as Record<string, (r: unknown) => Promise<unknown>>;
        return target[name]?.call(this.inner, request);
      };
    },
  });

  reset(): void {
    this.calls = [];
    this.failures.clear();
    this.hooks.clear();
  }

  callsOf(method: string): Call[] {
    return this.calls.filter((call) => call.method === method);
  }

  failWith(method: string, error: unknown, times = Number.POSITIVE_INFINITY): void {
    this.failures.set(method, { error, times });
  }

  async auth(owner: GitOwner) {
    return this.inner.authenticate({ installation: { id: "inspect", owner } });
  }
}

/** Pool du banc : une erreur d'un client inactif (ex. arrêt du serveur) ne doit pas être non gérée. */
function pooled(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString });
  pool.on("error", () => undefined);
  return pool;
}

export interface Scene {
  organizationId: string;
  projectId: string;
  repoId: string;
  userId: string;
  userName: string;
  userEmail: string;
  owner: GitOwner;
  ref: RepoRef;
  installationId: string;
}

export interface BatchInput {
  branch?: string;
  operations: { kind: string; specId?: string | null; payload?: Record<string, unknown> }[];
  status?: "queued" | "committing";
  baseSha?: string | null;
  message?: string | null;
  authorRole?: string | null;
  idempotencyKey?: string;
  authorUserId?: string | null;
}

export class WorkerBench {
  worker: Worker | undefined;

  private constructor(
    readonly container: StartedPostgreSqlContainer,
    readonly db: pg.Pool,
    readonly spy: SpyProvider,
  ) {}

  static async create(): Promise<WorkerBench> {
    const container = await startTestPostgres();
    migrateDeploy(container.getConnectionUri());
    return new WorkerBench(container, pooled(container.getConnectionUri()), new SpyProvider());
  }

  get url(): string {
    return this.container.getConnectionUri();
  }

  config(over: Record<string, unknown> = {}) {
    return {
      databaseUrl: this.url,
      appEnv: "test",
      appVersion: "dev",
      logLevel: "debug" as const,
      sentryDsn: undefined,
      mail: { kind: "capture" as const },
      webBaseUrl: "http://localhost:3000",
      ...over,
    };
  }

  /** Un seul worker à la fois (sinon l'ancien consommateur prend les jobs). */
  async start(
    options: Partial<StartWorkerOptions> & { specWrite?: Record<string, number> } = {},
    config: Record<string, unknown> = {},
    withProvider = true,
  ): Promise<Worker> {
    await this.stop();
    this.worker = await startWorker(this.config(config), {
      ...(withProvider ? { gitProvider: this.spy.provider } : {}),
      specWrite: { retryLimit: 1, retryDelaySeconds: 1 },
      ...options,
    } as StartWorkerOptions);
    return this.worker;
  }

  async stop(): Promise<void> {
    await this.worker?.stop();
    this.worker = undefined;
  }

  async dispose(): Promise<void> {
    await this.stop();
    await this.db.end();
    await this.container.stop();
  }

  async query<Row extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<Row[]> {
    return (await this.db.query<Row>(sql, params)).rows;
  }

  /** Locataire en base : organisation, utilisateur, projet, installation active. */
  private async seedTenant(owner: GitOwner, id: string) {
    const tenant = {
      organizationId: randomUUID(),
      projectId: randomUUID(),
      userId: randomUUID(),
      installationId: randomUUID(),
      userName: `Nom ${id.slice(0, 4)}`,
      userEmail: `user-${id.slice(0, 8)}@example.test`,
    };
    await this.query(
      "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $2, now(), now())",
      [tenant.organizationId, `org-${id}`],
    );
    await this.query(
      "INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now())",
      [tenant.userId, tenant.userName, tenant.userEmail],
    );
    await this.query(
      "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, 'Projet', now(), now())",
      [tenant.projectId, tenant.organizationId],
    );
    await this.query(
      `INSERT INTO provider_installations (id, organization_id, provider, external_id, owner_kind, owner_login, status, created_at, updated_at)
       VALUES ($1, $2, 'github', $3, 'organization', $4, 'active', now(), now())`,
      [
        tenant.installationId,
        tenant.organizationId,
        `${Math.floor(Math.random() * 1e9)}`,
        owner.login,
      ],
    );
    return tenant;
  }

  /** Dépôt du faux : branche par défaut avec le manifeste (sous `specPath` s'il y en a un) et branche `cadrage`. */
  private async seedGitRepo(ref: RepoRef, specPath: string | null | undefined) {
    const auth = await this.spy.inner.authenticate({
      installation: { id: "seed", owner: ref.owner },
    });
    const repo = await this.spy.inner.createRepo({
      auth,
      owner: ref.owner,
      name: ref.name,
      visibility: "private",
    });
    const prefix = specPath ? `${specPath}/` : "";
    await this.spy.inner.writeCommit({
      auth,
      repo: ref,
      branch: repo.defaultBranch,
      author: BOT,
      message: "chore: initialise",
      files: [{ path: `${prefix}koklo.project.yaml`, content: MANIFEST }],
    });
    await this.spy.inner.createBranch({
      auth,
      repo: ref,
      base: repo.defaultBranch,
      name: "cadrage",
    });
    return repo;
  }

  /** Organisation, utilisateur, projet, installation, ligne de repo et dépôt du faux (main + cadrage). */
  async scene(over: { specPath?: string | null } = {}): Promise<Scene> {
    const id = randomUUID();
    const owner: GitOwner = { kind: "organization", login: `acme-${id.slice(0, 8)}` };
    const tenant = await this.seedTenant(owner, id);
    const ref: RepoRef = { owner, name: `spec-${id.slice(0, 8)}` };
    const repo = await this.seedGitRepo(ref, over.specPath);
    const repoId = randomUUID();
    await this.query(
      `INSERT INTO project_repos (id, organization_id, project_id, installation_id, role, mode, external_id, owner_login, name, default_branch, spec_path, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $10, 'new', $5, $6, $7, $8, $9, now(), now())`,
      [
        repoId,
        tenant.organizationId,
        tenant.projectId,
        tenant.installationId,
        repo.id,
        owner.login,
        ref.name,
        repo.defaultBranch,
        over.specPath ?? null,
        over.specPath ? "monorepo" : "spec",
      ],
    );
    this.spy.reset();
    return { ...tenant, repoId, owner, ref };
  }

  /** Insère un lot et ses opérations (position base 1) ; rend son identifiant. */
  async insertBatch(scene: Scene, input: BatchInput): Promise<string> {
    const id = randomUUID();
    await this.query(
      `INSERT INTO spec_write_batches (id, organization_id, project_id, repo_id, branch, author_user_id, idempotency_key, base_sha, status, message, author_role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::write_batch_status, $10, $11, now(), now())`,
      [
        id,
        scene.organizationId,
        scene.projectId,
        scene.repoId,
        input.branch ?? "cadrage",
        input.authorUserId === undefined ? scene.userId : input.authorUserId,
        input.idempotencyKey ?? `k-${id}`,
        input.baseSha ?? null,
        input.status ?? "queued",
        input.message ?? null,
        input.authorRole === undefined ? "dev" : input.authorRole,
      ],
    );
    for (const [index, op] of input.operations.entries()) {
      await this.query(
        `INSERT INTO spec_write_operations (id, organization_id, batch_id, position, kind, target_spec_id, payload, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now())`,
        [
          randomUUID(),
          scene.organizationId,
          id,
          index + 1,
          op.kind,
          op.specId ?? null,
          JSON.stringify(op.payload ?? {}),
        ],
      );
    }
    return id;
  }

  /** Enfile comme le fera l'API : id = batchId, clé = repoId:branche. */
  async enqueue(scene: Scene, batchId: string, branch = "cadrage"): Promise<void> {
    const worker = this.worker;
    if (!worker) throw new Error("worker non démarré");
    await worker.boss.send(
      SPEC_WRITE_QUEUE,
      { batchId },
      { id: batchId, singletonKey: `${scene.repoId}:${branch}` },
    );
  }

  async batch(batchId: string) {
    const [row] = await this.query<{
      status: string;
      error_code: string | null;
      commit_sha: string | null;
      committed_at: Date | null;
      report: { issues: { code: string; severity: string }[]; truncated: boolean } | null;
    }>(
      "SELECT status, error_code, commit_sha, committed_at, report FROM spec_write_batches WHERE id = $1",
      [batchId],
    );
    return row;
  }

  /** Attend un statut terminal du lot (committed, failed ou conflict). */
  async settled(batchId: string, timeout = 40_000) {
    return vi.waitFor(
      async () => {
        const row = await this.batch(batchId);
        if (!row || row.status === "queued" || row.status === "committing") {
          throw new Error(`lot ${batchId} non terminé (${row?.status})`);
        }
        return row;
      },
      { timeout, interval: 150 },
    );
  }

  async job(batchId: string) {
    return this.worker?.boss.getJobById(SPEC_WRITE_QUEUE, batchId);
  }

  /**
   * Attend que pg-boss ait finalisé le job (`completed`) : il le fait un peu après le règlement du
   * lot en base. Ne relâche rien : un job qui n'arrive jamais à `completed` fait échouer l'attente.
   */
  async jobCompleted(batchId: string, timeout = 40_000) {
    return vi.waitFor(
      async () => {
        const job = await this.job(batchId);
        if (job?.state !== "completed") throw new Error(`job ${batchId} : ${job?.state}`);
        return job;
      },
      { timeout, interval: 100 },
    );
  }

  async commits(scene: Scene, branch = "cadrage", limit = 50) {
    const auth = await this.spy.auth(scene.owner);
    return this.spy.inner.listCommits({ auth, repo: scene.ref, ref: branch, limit });
  }

  async files(scene: Scene, branch = "cadrage") {
    const auth = await this.spy.auth(scene.owner);
    return (await this.spy.inner.listFiles({ auth, repo: scene.ref, ref: branch })).files.map(
      (file) => file.path,
    );
  }

  async read(scene: Scene, path: string, branch = "cadrage") {
    const auth = await this.spy.auth(scene.owner);
    return this.spy.inner.readFile({ auth, repo: scene.ref, ref: branch, path });
  }
}

export const createPayload = (title: string, over: Record<string, unknown> = {}) => ({
  title,
  priority: "must",
  ...over,
});
