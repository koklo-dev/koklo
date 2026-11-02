import * as Sentry from "@sentry/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "./config.ts";
import { instrumentJob, setupObservability } from "./observability.ts";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

const config: WorkerConfig = {
  databaseUrl: "postgres://x",
  appEnv: "staging",
  appVersion: "1.2.3",
  logLevel: "info",
  sentryDsn: undefined,
  mail: { kind: "capture" },
};

const lines: string[] = [];
const logStream = { write: (line: string) => void lines.push(line) };
const parsed = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);

beforeEach(() => {
  lines.length = 0;
  vi.clearAllMocks();
});

describe("setupObservability (TK-19)", () => {
  it("sans DSN : le SDK n'est pas initialisé, le logger écrit en JSON au niveau demandé", () => {
    const logger = setupObservability({ ...config, logLevel: "warn" }, { logStream });
    logger.info("ignoré");
    logger.warn("gardé");
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(parsed().map((line) => line.msg)).toEqual(["gardé"]);
  });

  it("avec DSN : init appelé une fois avec dsn, APP_ENV et APP_VERSION", () => {
    const dsn = "https://clef@glitchtip.example.com/2";
    setupObservability({ ...config, sentryDsn: dsn }, { logStream });
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn, environment: "staging", release: "1.2.3" }),
    );
  });
});

describe("instrumentJob (TK-19)", () => {
  const job = (id: string) => ({ id, data: {} });

  it("journalise chaque job avec son jobId et la file", async () => {
    const logger = setupObservability(config, { logStream });
    const handler = vi.fn(async () => undefined);
    await instrumentJob(logger, "noop", handler)([job("job-1"), job("job-2")]);
    expect(handler).toHaveBeenCalledTimes(2);
    const ids = new Set(parsed().map((line) => line.jobId));
    expect(ids).toEqual(new Set(["job-1", "job-2"]));
    expect(parsed().every((line) => line.queue === "noop")).toBe(true);
  });

  it("l'erreur d'un job est capturée avec jobId et file, journalisée en error, puis relancée", async () => {
    const logger = setupObservability(config, { logStream });
    const boom = new Error("échec métier");
    const run = instrumentJob(logger, "noop", async () => {
      throw boom;
    });
    await expect(run([job("job-9")])).rejects.toBe(boom);
    expect(Sentry.captureException).toHaveBeenCalledWith(boom, {
      tags: { jobId: "job-9", queue: "noop" },
    });
    expect(parsed().some((line) => line.jobId === "job-9" && (line.level as number) >= 50)).toBe(
      true,
    );
  });

  it("codeOnly : le journal ne contient que le nom et le code de l'erreur, jamais son contenu", async () => {
    const logger = setupObservability(config, { logStream });
    const secret = Object.assign(new Error("SELECT * FROM users WHERE email='a@secret.test'"), {
      code: "P2010",
    });
    const run = instrumentJob(
      logger,
      "send-notification-email",
      async () => {
        throw secret;
      },
      { codeOnly: true },
    );
    await expect(run([job("job-c")])).rejects.toBe(secret);
    const logged = lines.join("\n");
    expect(logged).not.toContain("secret.test");
    expect(logged).not.toContain("SELECT");
    expect(logged).toContain("P2010");
    const [captured] = vi.mocked(Sentry.captureException).mock.calls[0] ?? [];
    expect(String((captured as Error).message)).not.toContain("secret.test");
  });

  it("le worker continue : après un échec, le même consommateur traite le job suivant", async () => {
    const logger = setupObservability(config, { logStream });
    const handler = vi
      .fn<(j: { id: string }) => Promise<void>>()
      .mockRejectedValueOnce(new Error("premier échec"))
      .mockResolvedValueOnce(undefined);
    const run = instrumentJob(logger, "noop", handler);
    await expect(run([job("job-a")])).rejects.toThrow("premier échec");
    await expect(run([job("job-b")])).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("aucune capture quand le job réussit", async () => {
    const logger = setupObservability(config, { logStream });
    await instrumentJob(logger, "noop", async () => undefined)([job("job-ok")]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
