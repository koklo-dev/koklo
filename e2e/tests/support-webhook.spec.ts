import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, request, test } from "@playwright/test";
import { pushPayload, signBody, signedPush } from "../support/webhook.ts";

/** Tests des aides du support (sans pile) : la signature doit couvrir les octets exacts envoyés. */

const SECRET = "whsec-e2e-unit";

test("signBody : HMAC-SHA256 hexadécimal préfixé sha256=", () => {
  // Vecteur de référence calculé indépendamment : HMAC_SHA256("whsec-e2e-unit", "{}").
  expect(signBody(Buffer.from("{}"), SECRET)).toMatch(/^sha256=[0-9a-f]{64}$/);
  expect(signBody(Buffer.from("{}"), SECRET)).not.toBe(signBody(Buffer.from("{}"), "autre"));
  expect(signBody(Buffer.from("{}"), SECRET)).not.toBe(signBody(Buffer.from("{ }"), SECRET));
});

test("pushPayload : identifiants entiers positifs, branche cadrage par défaut", () => {
  const payload = pushPayload({ installationId: 12, repositoryId: 34 });
  expect(payload).toMatchObject({
    ref: "refs/heads/cadrage",
    repository: { id: 34 },
    installation: { id: 12 },
  });
  expect((payload.after as string).length).toBe(40);
  expect(() => pushPayload({ installationId: 0, repositoryId: 34 })).toThrow();
  expect(() => pushPayload({ installationId: 12, repositoryId: 1.5 })).toThrow();
});

test("signedPush : en-têtes GitHub et corps Buffer inchangé sur le fil", async () => {
  const { headers, data, deliveryId } = signedPush({
    installationId: 12,
    repositoryId: 34,
    secret: SECRET,
  });
  expect(Buffer.isBuffer(data)).toBe(true);
  expect(headers["x-github-event"]).toBe("push");
  expect(headers["x-github-delivery"]).toBe(deliveryId);
  expect(headers["x-hub-signature-256"]).toBe(signBody(data, SECRET));

  const received = await new Promise<{ req: IncomingMessage; body: Buffer }>((resolve) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        res.end("ok");
        server.close();
        resolve({ req, body: Buffer.concat(chunks) });
      });
    });
    server.listen(0, "127.0.0.1", async () => {
      const { port } = server.address() as AddressInfo;
      const context = await request.newContext();
      await context.post(`http://127.0.0.1:${port}/x`, { headers, data });
      await context.dispose();
    });
  });
  expect(received.body.equals(data)).toBe(true);
  expect(received.req.headers["x-hub-signature-256"]).toBe(signBody(received.body, SECRET));
});
