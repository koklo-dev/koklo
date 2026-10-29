import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SEND_INVITATION_QUEUE } from "../src/jobs/send-invitation.ts";
import { CaptureMailSender } from "../src/mail/capture-mail-sender.ts";
import type { MailSender } from "../src/mail/mail-sender.ts";
import { startWorker, type Worker } from "../src/worker.ts";

/** TK-23 : le consommateur send-invitation du worker (Postgres + pg-boss réels, envoi capturé). */
const URL_ACCEPT = "http://localhost:3000/accept-invitation/01900000-0000-7000-8000-000000000abc";
const PAYLOAD = {
  email: "invitee@example.test",
  url: URL_ACCEPT,
  inviterName: "Alice Admin",
  organizationName: "Cabinet Martin",
  role: "dev",
};
const lines: string[] = [];
const logStream = { write: (line: string) => void lines.push(line) };

let database: StartedPostgreSqlContainer;
const workers: Worker[] = [];

async function start(mailSender: MailSender): Promise<Worker> {
  await Promise.all(workers.splice(0).map((previous) => previous.stop()));
  const worker = await startWorker(
    {
      databaseUrl: database.getConnectionUri(),
      appEnv: "test",
      appVersion: "dev",
      logLevel: "debug" as const,
      sentryDsn: undefined,
      mail: { kind: "capture" as const },
    },
    { mailSender, logStream },
  );
  workers.push(worker);
  return worker;
}

beforeAll(async () => {
  database = await new PostgreSqlContainer("postgres:17-alpine").start();
});

beforeEach(() => {
  lines.length = 0;
});

afterAll(async () => {
  await Promise.all(workers.map((worker) => worker.stop()));
  await database?.stop();
});

describe("worker : job send-invitation (TK-23)", () => {
  it("consomme le job, envoie un email capturé, marque le job terminé", async () => {
    const sender = new CaptureMailSender();
    const worker = await start(sender);
    const id = await worker.boss.send(SEND_INVITATION_QUEUE, PAYLOAD);
    await vi.waitFor(
      async () => {
        const job = await worker.boss.getJobById(SEND_INVITATION_QUEUE, id as string);
        expect(job?.state).toBe("completed");
      },
      { timeout: 30_000, interval: 250 },
    );
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe(PAYLOAD.email);
    expect(sender.sent[0]?.text).toContain(URL_ACCEPT);
  });

  it("la file est configurée : 3 essais, rétention courte du payload (contient le lien)", async () => {
    const worker = await start(new CaptureMailSender());
    const queue = await worker.boss.getQueue(SEND_INVITATION_QUEUE);
    expect(queue?.retryLimit).toBe(3);
    expect(queue?.deleteAfterSeconds).toBeLessThanOrEqual(3600);
    expect(queue?.retentionSeconds).toBeLessThanOrEqual(3600);
  });

  it("aucun journal du worker ne contient le lien d'invitation, succès comme échec", async () => {
    const failing: MailSender = {
      send: async () => {
        throw new Error("provider unavailable");
      },
    };
    const worker = await start(failing);
    await worker.boss.send(SEND_INVITATION_QUEUE, PAYLOAD);
    await vi.waitFor(() => expect(lines.join("\n")).toContain("job failed"), {
      timeout: 30_000,
      interval: 100,
    });
    const output = lines.join("\n");
    expect(output).not.toContain(URL_ACCEPT);
    expect(output).not.toContain("accept-invitation");
  });
});
