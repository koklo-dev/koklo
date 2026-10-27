import { healthOutputSchema } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase, UNREACHABLE_DATABASE_URL } from "./helpers/app.ts";

let database: TestDatabase;
const apps: INestApplication[] = [];

async function appFor(options: Parameters<typeof createApp>[0]) {
  const app = await createApp(options);
  apps.push(app);
  return app;
}

beforeAll(async () => {
  database = await createSeededDatabase();
});

afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
  await database?.dispose();
});

describe("GET /health (critère 2)", () => {
  it("C2.1 base joignable : 200, corps conforme, version = APP_VERSION", async () => {
    const app = await appFor({ databaseUrl: database.url, appVersion: "1.4.2" });
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.status).toBe(200);
    expect(healthOutputSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toEqual({ status: "ok", version: "1.4.2" });
  });

  it("C2.2 APP_VERSION absent : version = dev", async () => {
    const app = await appFor({ databaseUrl: database.url });
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.body.version).toBe("dev");
  });

  it("C2.3 base injoignable (sonde réelle) : 500 INTERNAL, sans fuite de connexion", async () => {
    const app = await appFor({ databaseUrl: UNREACHABLE_DATABASE_URL });
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.status).toBe(500);
    expect(response.body.code).toBe("INTERNAL");
    expect(response.body.data.requestId).toEqual(expect.any(String));
    expect(response.body.data.requestId).not.toBe("");
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("secret-pw");
    expect(serialized).not.toContain("postgresql://");
  });

  it("C2.4 sonde qui ne répond pas : même erreur dans le délai (~2 s + marge)", async () => {
    const app = await appFor({
      databaseUrl: database.url,
      probe: { ping: () => new Promise<void>(() => undefined) },
    });
    const started = Date.now();
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.status).toBe(500);
    expect(response.body.code).toBe("INTERNAL");
    expect(Date.now() - started).toBeLessThan(4_000);
  });

  it("C2.5 x-request-id repris ; sinon un UUID est généré", async () => {
    const app = await appFor({ databaseUrl: UNREACHABLE_DATABASE_URL });
    const echoed = await request(app.getHttpServer()).get("/health").set("x-request-id", "req-42");
    expect(echoed.body.data.requestId).toBe("req-42");
    const generated = await request(app.getHttpServer()).get("/health");
    expect(generated.body.data.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("C2.6 ne demande aucune authentification", async () => {
    const app = await appFor({ databaseUrl: database.url });
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.status).toBe(200);
    expect(response.headers["www-authenticate"]).toBeUndefined();
  });
});
