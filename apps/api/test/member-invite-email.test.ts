import type { TestDatabase } from "@koklo/db/testing";
import type { CaptureMailSender, Worker } from "@koklo/worker";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { createMagicLinkApp, logSink, startCaptureWorker } from "./helpers/magic-link.ts";
import { call, insertActor, insertOrganization } from "./helpers/organizations.ts";

/**
 * TK-23 C6 : api -> pg-boss -> worker -> email d'invitation capturé (port MailSender de TK-22),
 * puis aucun jeton ni lien dans les journaux de l'api et du worker.
 */
const sink = logSink();
let database: TestDatabase;
let app: INestApplication;
let worker: Worker;
let sender: CaptureMailSender;

beforeAll(async () => {
  database = await createSeededDatabase();
  ({ worker, sender } = await startCaptureWorker(database.url, sink));
  app = await createMagicLinkApp(database.url, sink);
});

afterAll(async () => {
  await app?.close();
  await worker?.stop();
  await database?.dispose();
});

describe("email d'invitation (TK-23 C6)", () => {
  it("un seul email capturé : qui invite, organisation, rôle, lien d'acceptation ; aucun log du lien", async () => {
    const orgId = await insertOrganization(database, "cabinet-martin");
    const owner = await insertActor(database, orgId, "owner");
    const response = await call(app, owner.cookie, "post", "/members/invitations", {
      email: "invitee@example.test",
      role: "designer",
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);

    await vi.waitFor(() => expect(sender.sent.length).toBeGreaterThanOrEqual(1), {
      timeout: 30_000,
      interval: 100,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(sender.sent).toHaveLength(1);
    const message = sender.sent[0];
    const link = `http://localhost:3000/accept-invitation/${response.body.id}`;
    expect(message?.to).toBe("invitee@example.test");
    for (const body of [message?.text, message?.html]) {
      expect(body).toContain(owner.name);
      expect(body).toContain("cabinet-martin");
      expect(body).toContain("designer");
      expect(body).toContain(link);
    }
    expect(message?.subject).toContain("cabinet-martin");

    const output = sink.lines.join("\n");
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toContain(link);
    expect(output).not.toContain(response.body.id);
    expect(output).not.toContain("accept-invitation");
    expect(output).not.toContain("token=");
  });
});
