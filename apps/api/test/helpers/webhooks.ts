import { createHmac, randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { TestDatabase } from "@koklo/db/testing";
import { WEBHOOK_DELIVERY_QUEUE } from "@koklo/domain";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PgBoss } from "pg-boss";
import request from "supertest";
import { expect } from "vitest";
import { AppModule } from "../../src/app.module.ts";
import type { AppConfig } from "../../src/config.ts";
import { configFor } from "./app.ts";

/**
 * Banc des tests d'ingestion des webhooks (TK-45c1). Contrat attendu de la production :
 *  - route Nest brute `POST /api/webhooks/github`, hors oRPC et hors OpenAPI, sans session ;
 *  - `AppConfig.githubWebhookSecret?: string` (variable `GITHUB_WEBHOOK_SECRET`) ; absent ou vide :
 *    l'API démarre et la route répond 503 `{ error: "webhook_not_configured" }` ;
 *  - ordre des contrôles : 503, 413, 415, 401, 400, 202 ; réponse d'acceptation `{ received: true }` ;
 *  - table `webhook_deliveries` (client brut), file pg-boss `webhook-delivery` : job `{ deliveryId }`
 *    avec `id` = id de la ligne et `singletonKey` = `webhookDeliverySingletonKey(charge normalisée)`.
 * Le worker ne tourne pas : les jobs restent en file et se lisent dans `pgboss.job`.
 */
export const WEBHOOK_PATH = "/api/webhooks/github";
export const WEBHOOK_SECRET = "whsec-test-0123456789abcdef0123456789abcdef";
export const OTHER_SECRET = "whsec-autre-secret-fedcba9876543210fedcba98";
export const MAX_BODY = 5 * 1024 * 1024;

/** Valeurs sentinelles : elles ne doivent apparaître ni en base, ni dans les journaux, ni dans les erreurs. */
export const MARKERS = {
  email: "marqueur-auteur@exemple.invalid",
  author: "MarqueurAuteurSentinelle",
  message: "marqueur-message-de-commit-sentinelle",
  pusher: "marqueur-pusher-sentinelle",
} as const;

export const sha = (n: number): string => n.toString(16).padStart(40, "0");

export function sign(body: Uint8Array | string, secret: string = WEBHOOK_SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function pushBody(
  over: { installation?: number; repository?: number; ref?: string; after?: number } = {},
): Record<string, unknown> {
  return {
    ref: over.ref ?? "refs/heads/cadrage",
    before: sha(1),
    after: sha(over.after ?? 2),
    created: false,
    deleted: false,
    forced: false,
    repository: { id: over.repository ?? 5678, full_name: "acme/spec" },
    installation: { id: over.installation ?? 1234 },
    pusher: { name: MARKERS.pusher, email: MARKERS.email },
    sender: { login: MARKERS.pusher },
    commits: [
      {
        id: sha(2),
        message: MARKERS.message,
        author: { name: MARKERS.author, email: MARKERS.email },
        added: ["features/F-001.md"],
      },
    ],
    head_commit: {
      message: MARKERS.message,
      author: { name: MARKERS.author, email: MARKERS.email },
    },
  };
}

export function installationBody(action = "suspend"): Record<string, unknown> {
  return {
    action,
    installation: { id: 1234, account: { id: 99, login: "acme", type: "Organization" } },
    sender: { login: MARKERS.pusher, email: MARKERS.email },
  };
}

export const utf8 = (value: unknown): Buffer =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value), "utf8");

export interface Delivery {
  /** Octets envoyés (la signature est calculée dessus, sauf `signature` explicite). */
  body: Buffer;
  /** `null` : en-tête absent ; `undefined` : signature valide du corps. */
  signature?: string | null;
  deliveryId?: string | null;
  event?: string | null;
  contentType?: string | null;
  secret?: string;
}

/** Envoie une livraison telle que GitHub la poste ; chaque champ peut être altéré ou retiré. */
export function postWebhook(app: INestApplication, delivery: Delivery) {
  const req = request(app.getHttpServer()).post(WEBHOOK_PATH);
  if (delivery.contentType !== null) {
    req.set("Content-Type", delivery.contentType ?? "application/json");
  }
  const signature =
    delivery.signature === undefined ? sign(delivery.body, delivery.secret) : delivery.signature;
  if (signature !== null) req.set("X-Hub-Signature-256", signature);
  const deliveryId = delivery.deliveryId === undefined ? randomUUID() : delivery.deliveryId;
  if (deliveryId !== null) req.set("X-GitHub-Delivery", deliveryId);
  const event = delivery.event === undefined ? "push" : delivery.event;
  if (event !== null) req.set("X-GitHub-Event", event);
  // superagent sérialise un Buffer en JSON `{type:"Buffer",data:[...]}` quand le type est application/json :
  // le sérialiseur identité envoie les octets exacts sur lesquels la signature est calculée.
  return req.serialize((payload: unknown) => payload as unknown as string).send(delivery.body);
}

export interface RawResult {
  status: number;
  body: string;
}

/** Requête HTTP brute (en-têtes dupliqués, Content-Length menteur, corps non annoncé). */
export async function rawRequest(
  app: INestApplication,
  options: {
    headers: Record<string, string | string[]>;
    /** Octets réellement écrits ; absent : en-têtes seuls, le corps n'est jamais envoyé. */
    payload?: Buffer;
    chunked?: boolean;
  },
): Promise<RawResult> {
  if (!app.getHttpServer().listening) await app.listen(0, "127.0.0.1");
  const { port } = app.getHttpServer().address() as AddressInfo;
  return new Promise<RawResult>((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method: "POST", path: WEBHOOK_PATH, headers: options.headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
        );
      },
    );
    // Le serveur peut répondre (413) avant d'avoir lu tout le corps : l'écriture peut alors échouer.
    req.on("error", reject);
    if (options.payload === undefined) {
      req.flushHeaders();
      return;
    }
    req.write(options.payload, () => undefined);
    req.end();
  });
}

export interface WebhookApp {
  app: INestApplication;
  lines: string[];
}

/** Application réelle (producteur pg-boss réel) ; `secret: null` : variable absente. */
export async function createWebhookApp(
  databaseUrl: string,
  options: { secret?: string | null; logLevel?: AppConfig["logLevel"] } = {},
): Promise<WebhookApp> {
  const lines: string[] = [];
  const secret = options.secret === undefined ? WEBHOOK_SECRET : options.secret;
  const config = {
    ...configFor({ databaseUrl }),
    logLevel: options.logLevel ?? "info",
    ...(secret === null ? {} : { githubWebhookSecret: secret }),
  } as AppConfig;
  const app = (
    await Test.createTestingModule({
      imports: [
        AppModule.forRoot(config, { logStream: { write: (l: string) => void lines.push(l) } }),
      ],
    }).compile()
  ).createNestApplication();
  await app.init();
  return { app, lines };
}

/** Le worker possède la création de la file ; ici le test en tient lieu (même politique). */
export async function startQueueBoss(databaseUrl: string, createQueue = true): Promise<PgBoss> {
  const boss = new PgBoss(databaseUrl);
  boss.on("error", () => undefined);
  await boss.start();
  if (createQueue) await boss.createQueue(WEBHOOK_DELIVERY_QUEUE, { policy: "key_strict_fifo" });
  return boss;
}

export type DeliveryRow = {
  id: string;
  provider: string;
  delivery_id: string;
  event: string;
  action: string | null;
  installation_external_id: string | null;
  repo_external_id: string | null;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  error_code: string | null;
};

export async function deliveryRows(database: TestDatabase): Promise<DeliveryRow[]> {
  return database.query<DeliveryRow>(
    "SELECT id, provider::text AS provider, delivery_id, event::text AS event, action, installation_external_id, repo_external_id, payload, status::text AS status, attempts, error_code FROM webhook_deliveries ORDER BY received_at, id",
  );
}

export type JobRow = { id: string; name: string; singleton_key: string | null; data: unknown };

export async function deliveryJobs(database: TestDatabase): Promise<JobRow[]> {
  return database.query<JobRow>(
    "SELECT id, name, singleton_key, data FROM pgboss.job WHERE name = $1 ORDER BY created_on",
    [WEBHOOK_DELIVERY_QUEUE],
  );
}

export async function resetIngestion(database: TestDatabase): Promise<void> {
  await database.query("DELETE FROM webhook_deliveries");
  await database.query("DELETE FROM pgboss.job WHERE name = $1", [WEBHOOK_DELIVERY_QUEUE]);
}

/** Rien n'a été écrit : ni ligne, ni job. */
export async function expectNothingWritten(database: TestDatabase): Promise<void> {
  expect(await deliveryRows(database)).toEqual([]);
  expect(await deliveryJobs(database)).toEqual([]);
}
