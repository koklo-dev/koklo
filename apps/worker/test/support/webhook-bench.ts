import { randomUUID } from "node:crypto";
import {
  type InstallationWebhook,
  type InstallationWebhookAction,
  type PushWebhook,
  WEBHOOK_DELIVERY_QUEUE,
  webhookDeliverySingletonKey,
} from "@koklo/domain";
import { vi } from "vitest";
import type { StartWorkerOptions, Worker } from "../../src/worker.ts";
import { underSpecPath } from "./spec-files.ts";
import { BOT, type Scene, WorkerBench } from "./spec-write-bench.ts";

/**
 * Banc des tests d'intégration de TK-45b (livraisons de webhook) : le banc de `spec-write`
 * (Postgres tmpfs migré, vrai pg-boss, vrai worker, faux fournisseur espionné) plus des aides pour
 * insérer des livraisons normalisées, les enfiler comme le fera l'API (45c) et lire l'index.
 *
 * Contrat attendu de la production :
 *  - `WEBHOOK_DELIVERY_QUEUE = "webhook-delivery"` (@koklo/domain), file `key_strict_fifo` ;
 *  - job `{ deliveryId }` envoyé avec `id = deliveryId` (id de ligne) et
 *    `singletonKey = webhookDeliverySingletonKey(charge)` ;
 *  - `startWorker(config, { gitProvider, logStream, webhookDelivery: { retryLimit, retryDelaySeconds } })` ;
 *  - `WorkerConfig.webhookRetentionDays: number` (variable `WEBHOOK_RETENTION_DAYS`).
 */
export const DELIVERY_QUEUE = WEBHOOK_DELIVERY_QUEUE;
export const PURGE_QUEUE = "webhook-purge";
export const sha = (n: number): string => n.toString(16).padStart(40, "0");
/** Attente maximale d'un règlement ; `WEBHOOK_TEST_WAIT_MS` la réduit pour prouver le rouge vite. */
export const WAIT_MS = Number(process.env.WEBHOOK_TEST_WAIT_MS ?? 40_000);
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface WebhookScene extends Scene {
  installationExternalId: string;
  repoExternalId: string;
  specPath: string | null;
}

export type DeliveryRow = {
  id: string;
  delivery_id: string;
  event: string;
  status: string;
  attempts: number;
  error_code: string | null;
  processed_at: Date | null;
  updated_at: Date;
};

export interface InsertDelivery {
  event?: string;
  action?: string | null;
  installationExternalId?: string | null;
  repoExternalId?: string | null;
  payload?: Record<string, unknown>;
  status?: string;
  attempts?: number;
  errorCode?: string | null;
  receivedAt?: Date;
  processedAt?: Date | null;
}

export class WebhookBench {
  readonly lines: string[] = [];
  /** Branches « force-pushées » : toute requête de lecture sur ce ref est redirigée vers le SHA. */
  readonly repoints = new Map<string, string>();
  private readonly logStream = { write: (line: string) => void this.lines.push(line) };
  /** Fournisseur donné au worker : le faux espionné, avec les redirections de refs. */
  readonly provider = new Proxy({} as WorkerBench["spy"]["provider"], {
    get: (_target, name) => {
      const method = Reflect.get(this.inner.spy.provider, name);
      if (typeof method !== "function") return undefined;
      return (request: Record<string, unknown>) => {
        const ref = typeof request.ref === "string" ? this.repoints.get(request.ref) : undefined;
        return method(ref === undefined ? request : { ...request, ref });
      };
    },
  });

  private constructor(readonly inner: WorkerBench) {}

  static async create(): Promise<WebhookBench> {
    return new WebhookBench(await WorkerBench.create());
  }

  get spy() {
    return this.inner.spy;
  }

  get worker(): Worker {
    if (!this.inner.worker) throw new Error("worker non démarré");
    return this.inner.worker;
  }

  query<Row extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return this.inner.query<Row>(sql, params);
  }

  async start(config: Record<string, unknown> = {}, settings: Record<string, number> = {}) {
    this.lines.length = 0;
    this.spy.reset();
    return this.inner.start(
      {
        gitProvider: this.provider,
        logStream: this.logStream,
        webhookDelivery: { retryLimit: 1, retryDelaySeconds: 1, ...settings },
      } as Partial<StartWorkerOptions>,
      config,
    );
  }

  async dispose(): Promise<void> {
    await this.inner.dispose();
  }

  /** Locataire + dépôt de spec (branches main et cadrage) ; `specPath` : spec dans un monorepo. */
  async scene(over: { specPath?: string | null } = {}): Promise<WebhookScene> {
    const scene = await this.inner.scene(over);
    const [installation] = await this.query<{ external_id: string }>(
      "SELECT external_id FROM provider_installations WHERE id = $1",
      [scene.installationId],
    );
    const [repo] = await this.query<{ external_id: string }>(
      "SELECT external_id FROM project_repos WHERE id = $1",
      [scene.repoId],
    );
    return {
      ...scene,
      installationExternalId: installation?.external_id ?? "",
      repoExternalId: repo?.external_id ?? "",
      specPath: over.specPath ?? null,
    };
  }

  /** Un commit du bot sur `branch` (créée depuis `cadrage` si elle n'existe pas) ; rend son SHA. */
  async commit(
    scene: WebhookScene,
    files: Record<string, string | null>,
    branch = "cadrage",
    base = "cadrage",
  ) {
    const auth = await this.spy.auth(scene.owner);
    const inner = this.spy.inner;
    const known = (await inner.listFiles({ auth, repo: scene.ref, ref: base })).ref;
    if (branch !== "cadrage") {
      await inner
        .createBranch({ auth, repo: scene.ref, base: known, name: branch })
        .catch(() => undefined);
    }
    const prefixed = underSpecPath(scene, files as Record<string, string>);
    const changes = Object.entries(prefixed).map(([path, content]) =>
      content === null ? { path, delete: true as const } : { path, content },
    );
    const commit = await inner.writeCommit({
      auth,
      repo: scene.ref,
      branch,
      files: changes,
      author: BOT,
      message: "feat: spec",
    });
    return commit.sha;
  }

  async head(scene: WebhookScene, branch = "cadrage"): Promise<string> {
    const auth = await this.spy.auth(scene.owner);
    return (await this.spy.inner.listFiles({ auth, repo: scene.ref, ref: branch })).ref;
  }

  async insertDelivery(input: InsertDelivery = {}): Promise<string> {
    const id = randomUUID();
    await this.query(
      `INSERT INTO webhook_deliveries (id, provider, delivery_id, event, action, installation_external_id, repo_external_id, payload, status, attempts, error_code, received_at, processed_at, created_at, updated_at)
       VALUES ($1, 'github', $2, $3::webhook_event, $4, $5, $6, $7::jsonb, $8::webhook_delivery_status, $9, $10, $11, $12, now(), now())`,
      [
        id,
        randomUUID(),
        input.event ?? "push",
        input.action ?? null,
        input.installationExternalId ?? null,
        input.repoExternalId ?? null,
        JSON.stringify(input.payload ?? {}),
        input.status ?? "received",
        input.attempts ?? 0,
        input.errorCode ?? null,
        input.receivedAt ?? new Date(),
        input.processedAt ?? null,
      ],
    );
    return id;
  }

  /** Charge `push` normalisée (forme de `PushWebhook`, @koklo/domain). */
  pushPayload(scene: WebhookScene, over: Partial<PushWebhook> = {}): PushWebhook {
    const branch = over.branch === undefined ? "cadrage" : over.branch;
    return {
      event: "push",
      deliveryId: randomUUID(),
      installationId: scene.installationExternalId,
      repositoryId: scene.repoExternalId,
      ref: branch === null ? "refs/tags/v1" : `refs/heads/${branch}`,
      branch,
      before: sha(1),
      after: sha(2),
      created: false,
      deleted: false,
      forced: false,
      ...over,
    };
  }

  installationPayload(
    scene: Pick<WebhookScene, "installationExternalId">,
    action: InstallationWebhookAction,
    installationId = scene.installationExternalId,
  ): InstallationWebhook {
    return {
      event: "installation",
      deliveryId: randomUUID(),
      action,
      installationId,
      account: { externalId: "77", login: "acme", kind: "organization" },
    };
  }

  /** Insère la ligne `received` d'une charge normalisée et l'enfile comme le fera l'API. */
  async deliver(payload: PushWebhook | InstallationWebhook, over: InsertDelivery = {}) {
    const id = await this.insertDelivery({
      event: payload.event,
      action: payload.event === "installation" ? payload.action : null,
      installationExternalId: payload.installationId,
      repoExternalId: payload.event === "push" ? payload.repositoryId : null,
      payload: payload as unknown as Record<string, unknown>,
      ...over,
    });
    await this.enqueue(id, webhookDeliverySingletonKey(payload));
    return id;
  }

  async enqueue(deliveryId: string, singletonKey: string, jobId: string = deliveryId) {
    return this.worker.boss.send(DELIVERY_QUEUE, { deliveryId }, { id: jobId, singletonKey });
  }

  async delivery(id: string): Promise<DeliveryRow> {
    const [row] = await this.query<DeliveryRow>(
      "SELECT id, delivery_id, event, status, attempts, error_code, processed_at, updated_at FROM webhook_deliveries WHERE id = $1",
      [id],
    );
    if (!row) throw new Error(`livraison ${id} absente`);
    return row;
  }

  /** Attend un statut terminal de la livraison (processed, ignored ou failed). */
  async settled(id: string, timeout = WAIT_MS): Promise<DeliveryRow> {
    return vi.waitFor(
      async () => {
        const row = await this.delivery(id);
        if (["received", "processing"].includes(row.status)) {
          throw new Error(`livraison non terminée (${row.status})`);
        }
        return row;
      },
      { timeout, interval: 150 },
    );
  }

  /**
   * Comme `settled`, pour une livraison insérée dans un statut terminal (`failed`) puis ré-enfilée :
   * attend qu'elle quitte `from`, sinon `settled` rendrait la ligne d'avant l'exécution du worker.
   */
  async settledAfter(id: string, from: string, timeout = WAIT_MS): Promise<DeliveryRow> {
    return vi.waitFor(
      async () => {
        const row = await this.delivery(id);
        if ([from, "received", "processing"].includes(row.status)) {
          throw new Error(`livraison non retraitée (${row.status})`);
        }
        return row;
      },
      { timeout, interval: 150 },
    );
  }

  /** Attend que le job pg-boss soit `completed` (jamais `failed` : la clé ne doit pas être bloquée). */
  async jobCompleted(id: string, timeout = WAIT_MS) {
    return vi.waitFor(
      async () => {
        const job = await this.worker.boss.getJobById(DELIVERY_QUEUE, id);
        if (job?.state !== "completed") throw new Error(`job ${id} : ${job?.state}`);
        return job;
      },
      { timeout, interval: 150 },
    );
  }

  async snapshots(scene: WebhookScene) {
    return this.query<{
      id: string;
      commit_sha: string;
      status: string;
      error_code: string | null;
    }>(
      "SELECT id, commit_sha, status, error_code FROM spec_snapshots WHERE repo_id = $1 ORDER BY created_at, id",
      [scene.repoId],
    );
  }

  async headSha(scene: WebhookScene, branch = "cadrage"): Promise<string | undefined> {
    const [row] = await this.query<{ commit_sha: string }>(
      `SELECT s.commit_sha FROM spec_heads h JOIN spec_snapshots s ON s.id = h.snapshot_id
       WHERE h.repo_id = $1 AND h.branch = $2`,
      [scene.repoId, branch],
    );
    return row?.commit_sha;
  }

  async featureIds(snapshotId: string): Promise<string[]> {
    const rows = await this.query<{ spec_id: string }>(
      "SELECT spec_id FROM spec_features WHERE snapshot_id = $1 ORDER BY spec_id",
      [snapshotId],
    );
    return rows.map((row) => row.spec_id);
  }

  async counter(scene: WebhookScene): Promise<number | undefined> {
    const [row] = await this.query<{ last_value: number }>(
      "SELECT last_value FROM project_counters WHERE project_id = $1 AND name = 'feature'",
      [scene.projectId],
    );
    return row?.last_value;
  }

  /** Pousse un push sur une branche et attend son règlement. */
  async push(scene: WebhookScene, over: Partial<PushWebhook> = {}) {
    const id = await this.deliver(this.pushPayload(scene, over));
    return this.settled(id);
  }
}
