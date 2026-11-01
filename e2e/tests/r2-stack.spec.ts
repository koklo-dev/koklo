import { randomUUID } from "node:crypto";
import { expect, request, test } from "@playwright/test";
import {
  insertMembership,
  insertSession,
  insertUser,
  SESSION_COOKIE,
  withClient,
} from "../support/db.ts";
import { seedProviderInstallation } from "../support/installation.ts";
import { apiUrl, ORPC_PATH } from "../support/stack.ts";
import { postSignedPush } from "../support/webhook.ts";

/**
 * T0 (TK-49a) : smoke de la pile R2. La pile e2e doit contenir un fournisseur Git (le faux, injecté
 * par le lanceur `e2e/scripts/stack.ts`) et un secret webhook ; sans eux ces routes répondent 503.
 */

test("/health répond 200 sur l'API", async () => {
  const context = await request.newContext();
  const response = await context.get(`${apiUrl()}/health`);
  expect(response.status()).toBe(200);
  await context.dispose();
});

test("webhook : une mauvaise signature donne 401 (et non 503 : un secret est branché)", async ({
  request: web,
}) => {
  const { response } = await postSignedPush(web, {
    installationId: 4242,
    repositoryId: 4343,
    secret: "mauvais-secret-e2e",
  });
  expect(response.status()).toBe(401);
});

test("installation.start renvoie une URL du faux fournisseur", async ({ baseURL }) => {
  const slug = `r2-stack-${randomUUID().slice(0, 8)}`;
  const cookie = await withClient(async (client) => {
    const organizationId = randomUUID();
    await client.query(
      `INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, now(), now())`,
      [organizationId, `Organisation ${slug}`, slug],
    );
    const userId = await insertUser(client, { email: `${slug}@example.com`, name: slug });
    await insertMembership(client, organizationId, userId, "owner");
    await seedProviderInstallation(client, { organizationId, ownerLogin: slug });
    return insertSession(client, userId, organizationId);
  });
  const context = await request.newContext({
    baseURL,
    extraHTTPHeaders: { cookie: `${SESSION_COOKIE}=${cookie}` },
  });
  const response = await context.post(`${ORPC_PATH}/provider/installations/start`, { data: {} });
  expect(response.status(), await response.text()).toBe(200);
  const { url } = (await response.json()) as { url: string };
  expect(url).toContain("koklo-fake");
  await context.dispose();
});
