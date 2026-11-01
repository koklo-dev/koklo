import { createHmac, randomUUID } from "node:crypto";
import { type APIRequestContext, type APIResponse, expect } from "@playwright/test";
import { requiredEnv, withClient } from "./db.ts";
import { WEBHOOK_PATH } from "./stack.ts";

/**
 * Support e2e (pas du code de production) : imite GitHub. Le faux fournisseur n'émet aucun webhook,
 * donc les parcours postent eux-mêmes des `push` signés (HMAC-SHA256 du corps brut exact avec
 * `GITHUB_WEBHOOK_SECRET`, posé par le lanceur) puis attendent l'effet du worker, avec des bornes.
 */

export const POLL_TIMEOUT_MS = 15_000;
const POLL_INTERVALS = [250, 500, 1000];
const sha = (n: number): string => n.toString(16).padStart(40, "0");

/** `sha256=<hex>` du corps brut, tel que GitHub l'envoie dans `X-Hub-Signature-256`. */
export function signBody(body: Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export interface PushOptions {
  /** `installation.id` GitHub : entier positif (`provider_installations.external_id`). */
  installationId: number;
  /** `repository.id` GitHub : entier positif (`project_repos.external_id`). */
  repositoryId: number;
  ref?: string;
  after?: string;
}

/** Charge `push` minimale valable ; les identifiants doivent être des entiers positifs sûrs. */
export function pushPayload(options: PushOptions): Record<string, unknown> {
  for (const id of [options.installationId, options.repositoryId]) {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error(`identifiant GitHub invalide : ${id}`);
  }
  return {
    ref: options.ref ?? "refs/heads/cadrage",
    before: sha(1),
    after: options.after ?? sha(2),
    created: false,
    deleted: false,
    forced: false,
    repository: { id: options.repositoryId, full_name: "e2e/spec" },
    installation: { id: options.installationId },
  };
}

export interface SignedPushOptions extends PushOptions {
  deliveryId?: string;
  /** Par défaut `GITHUB_WEBHOOK_SECRET` ; une autre valeur sert aux cas de mauvaise signature. */
  secret?: string;
}

/** En-têtes et corps (Buffer) d'une livraison `push` : jamais d'objet que Playwright resérialiserait. */
export function signedPush(options: SignedPushOptions): {
  headers: Record<string, string>;
  data: Buffer;
  deliveryId: string;
} {
  const data = Buffer.from(JSON.stringify(pushPayload(options)));
  const deliveryId = options.deliveryId ?? randomUUID();
  return {
    deliveryId,
    data,
    headers: {
      "content-type": "application/json",
      "x-github-event": "push",
      "x-github-delivery": deliveryId,
      "x-hub-signature-256": signBody(data, options.secret ?? requiredEnv("GITHUB_WEBHOOK_SECRET")),
    },
  };
}

/** Poste un `push` signé sur le web (chemin de production). `response` : 202 attendu si signé. */
export async function postSignedPush(
  request: APIRequestContext,
  options: SignedPushOptions,
): Promise<{ response: APIResponse; deliveryId: string }> {
  const { headers, data, deliveryId } = signedPush(options);
  return { response: await request.post(WEBHOOK_PATH, { headers, data }), deliveryId };
}

/** Attend (borné) que le worker ait traité la livraison. */
export async function waitForDeliveryProcessed(deliveryId: string): Promise<void> {
  await expect
    .poll(
      () =>
        withClient(async (client) => {
          const { rows } = await client.query<{ status: string }>(
            "SELECT status FROM webhook_deliveries WHERE delivery_id = $1",
            [deliveryId],
          );
          return rows[0]?.status ?? "absent";
        }),
      {
        message: `livraison ${deliveryId} traitée`,
        timeout: POLL_TIMEOUT_MS,
        intervals: POLL_INTERVALS,
      },
    )
    .toBe("processed");
}

/** Attend (borné) que `spec.head` expose un index prêt, et renvoie son `commitSha`. */
export async function waitForSpecHead(
  request: APIRequestContext,
  projectId: string,
  expectedSha?: string,
): Promise<string> {
  let head: { commitSha: string; status: string } | null = null;
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/orpc/projects/${projectId}/spec`);
        head = response.ok() ? ((await response.json()) as typeof head) : null;
        return head?.status === "ready" && (!expectedSha || head.commitSha === expectedSha);
      },
      {
        message: `spec.head prêt pour ${projectId}`,
        timeout: POLL_TIMEOUT_MS,
        intervals: POLL_INTERVALS,
      },
    )
    .toBe(true);
  return (head as unknown as { commitSha: string }).commitSha;
}
