import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SEND_MAGIC_LINK_QUEUE } from "../src/jobs/send-magic-link.ts";
import { CaptureMailSender } from "../src/mail/capture-mail-sender.ts";
import type { MailSender } from "../src/mail/mail-sender.ts";
import { startWorker, type Worker } from "../src/worker.ts";

/**
 * TK-22 : le consommateur send-magic-link du worker (Postgres + pg-boss réels, envoi capturé),
 * sans aucune clé Resend (C8). Contrat : `startWorker(config, { mailSender, logStream })`.
 */
const TOKEN = "Zk9qWmV4Tn0aB7cD2eF5gH8jK1mP4rS6";
const LINK = `http://localhost:3000/api/auth/magic-link/verify?token=${TOKEN}&callbackURL=%2F`;
const lines: string[] = [];
const logStream = { write: (line: string) => void lines.push(line) };

let database: StartedPostgreSqlContainer;
const workers: Worker[] = [];

const config = (databaseUrl: string) => ({
  databaseUrl,
  appEnv: "test",
  appVersion: "dev",
  logLevel: "debug" as const,
  sentryDsn: undefined,
  mail: { kind: "capture" as const },
});

async function start(mailSender: MailSender): Promise<Worker> {
  // Un seul consommateur à la fois : sinon le worker du test précédent prend le job.
  await Promise.all(workers.splice(0).map((previous) => previous.stop()));
  const worker = await startWorker(config(database.getConnectionUri()), { mailSender, logStream });
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

describe("worker : job send-magic-link (TK-22 C1, C6)", () => {
  it("C1 consomme le job, envoie un email capturé, marque le job terminé", async () => {
    const sender = new CaptureMailSender();
    const worker = await start(sender);
    const id = await worker.boss.send(SEND_MAGIC_LINK_QUEUE, {
      email: "alice@example.test",
      url: LINK,
    });
    await vi.waitFor(
      async () => {
        const job = await worker.boss.getJobById(SEND_MAGIC_LINK_QUEUE, id as string);
        expect(job?.state).toBe("completed");
      },
      { timeout: 30_000, interval: 250 },
    );
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe("alice@example.test");
    expect(sender.sent[0]?.text).toContain(TOKEN);
  });

  it("la file est configurée : 3 essais, rétention courte du payload (contient le lien)", async () => {
    const worker = await start(new CaptureMailSender());
    const queue = await worker.boss.getQueue(SEND_MAGIC_LINK_QUEUE);
    expect(queue?.retryLimit).toBe(3);
    expect(queue?.deleteAfterSeconds).toBeLessThanOrEqual(3600);
    expect(queue?.retentionSeconds).toBeLessThanOrEqual(3600);
  });

  it("C6 aucun journal du worker ne contient le jeton ni l'URL, succès comme échec", async () => {
    const failing: MailSender = {
      send: async () => {
        throw new Error("provider unavailable");
      },
    };
    const worker = await start(failing);
    await worker.boss.send(SEND_MAGIC_LINK_QUEUE, { email: "alice@example.test", url: LINK });
    await vi.waitFor(() => expect(lines.join("\n")).toContain("job failed"), {
      timeout: 30_000,
      interval: 100,
    });
    const output = lines.join("\n");
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain(LINK);
    expect(output).not.toContain("magic-link/verify");
  });
});
