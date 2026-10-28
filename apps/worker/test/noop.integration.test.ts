import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { NOOP_QUEUE } from "../src/jobs/noop.ts";
import { startWorker, type Worker } from "../src/worker.ts";

let database: StartedPostgreSqlContainer;
let worker: Worker;

beforeAll(async () => {
  database = await new PostgreSqlContainer("postgres:17-alpine").start();
  worker = await startWorker({
    databaseUrl: database.getConnectionUri(),
    appEnv: "test",
    appVersion: "dev",
    logLevel: "silent",
    sentryDsn: undefined,
    mail: { kind: "capture" },
  });
});

afterAll(async () => {
  await worker?.stop();
  await database?.stop();
});

it("consumes a published noop job and marks it completed", async () => {
  const id = await worker.boss.send(NOOP_QUEUE, {});
  expect(id).toBeTruthy();

  await vi.waitFor(
    async () => {
      const job = await worker.boss.getJobById(NOOP_QUEUE, id as string);
      expect(job?.state).toBe("completed");
    },
    { timeout: 30_000, interval: 250 },
  );
});
