import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as Sentry from "@sentry/node";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module.ts";
import type { AppConfig } from "../src/config.ts";
import { configFor, UNREACHABLE_DATABASE_URL } from "./helpers/app.ts";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

/** Contrat : `AppModule.forRoot(config, { logStream })` redirige les lignes pino vers ce flux. */
const apps: INestApplication[] = [];
const lines: string[] = [];
const logStream = { write: (line: string) => void lines.push(line) };

async function startApp(overrides: Partial<AppConfig> = {}): Promise<INestApplication> {
  const config: AppConfig = {
    ...configFor({ databaseUrl: UNREACHABLE_DATABASE_URL }),
    logLevel: "info",
    sentryDsn: undefined,
    ...overrides,
  };
  const app = (
    await Test.createTestingModule({
      imports: [AppModule.forRoot(config, { logStream })],
    }).compile()
  ).createNestApplication();
  await app.init();
  apps.push(app);
  return app;
}

function parsed(): Record<string, unknown>[] {
  return lines.flatMap((line) => {
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

beforeEach(() => {
  lines.length = 0;
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("observabilité de l'api (TK-19)", () => {
  it("sans DSN : l'application démarre et le SDK n'est pas initialisé", async () => {
    const app = await startApp();
    expect((await request(app.getHttpServer()).get("/health")).status).toBeGreaterThan(0);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("avec DSN : init appelé une fois avec dsn, APP_ENV et APP_VERSION", async () => {
    const dsn = "https://clef@glitchtip.example.com/1";
    await startApp({ sentryDsn: dsn, appEnv: "staging", appVersion: "3.1.0" });
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn, environment: "staging", release: "3.1.0" }),
    );
  });

  it("une requête produit une ligne JSON dont requestId égale x-request-id", async () => {
    const app = await startApp();
    await request(app.getHttpServer()).get("/health").set("x-request-id", "corr-abc-123");
    const matching = parsed().filter((line) => line.requestId === "corr-abc-123");
    expect(matching.length).toBeGreaterThan(0);
  });

  it("sans x-request-id : requestId est un UUID généré, identique à celui de la réponse", async () => {
    const app = await startApp();
    const response = await request(app.getHttpServer()).get("/health");
    const id = response.body.data.requestId as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(parsed().some((line) => line.requestId === id)).toBe(true);
  });

  it("guard journalise l'erreur via le logger JSON, avec le requestId, niveau error", async () => {
    const app = await startApp();
    await request(app.getHttpServer()).get("/health").set("x-request-id", "corr-guard-1");
    const errorLines = parsed().filter(
      (line) => line.requestId === "corr-guard-1" && (line.level as number) >= 50,
    );
    expect(errorLines.length).toBeGreaterThan(0);
  });

  it("une erreur de handler est capturée par le SDK et reste INTERNAL côté client", async () => {
    const app = await startApp();
    const response = await request(app.getHttpServer())
      .get("/health")
      .set("x-request-id", "corr-capture-1");
    expect(response.status).toBe(500);
    expect(response.body.code).toBe("INTERNAL");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ requestId: "corr-capture-1" }) }),
    );
  });
});

describe("journaux de l'api (TK-19)", () => {
  it("aucun secret (authorization, cookie) dans les lignes", async () => {
    const app = await startApp();
    await request(app.getHttpServer())
      .get("/health")
      .set("authorization", "Bearer jeton-ultra-secret")
      .set("cookie", "session=cookie-ultra-secret");
    expect(lines.length).toBeGreaterThan(0);
    const output = lines.join("");
    expect(output).not.toContain("jeton-ultra-secret");
    expect(output).not.toContain("cookie-ultra-secret");
  });

  it("LOG_LEVEL=error filtre les lignes de requête de niveau info", async () => {
    const app = await startApp({ logLevel: "error" });
    await request(app.getHttpServer()).get("/health");
    expect(parsed().every((line) => (line.level as number) >= 50)).toBe(true);
  });
});
