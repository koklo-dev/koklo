import { randomUUID } from "node:crypto";
import { generateOpenApi } from "@koklo/contract";
import { SEED_IDS } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_SESSION_RESOLVER } from "../src/auth/test-session.ts";
import { createApp, createSeededDatabase, UNREACHABLE_DATABASE_URL } from "./helpers/app.ts";
import {
  insertMember,
  insertSession,
  insertUser,
  SESSION_COOKIE,
  signedSessionCookie,
} from "./helpers/session.ts";

const OTHER_ORG = "01900000-0000-7000-8000-0000000000f1";
const OTHER_PROJECT = "01900000-0000-7000-8000-0000000000f2";
const OUTSIDER = "01900000-0000-7000-8000-0000000000f3";
const SEED_PROJECTS = [{ id: SEED_IDS.project, name: "Projet de démo" }];
const TEST_SESSION = `${SEED_IDS.adminUser}:${SEED_IDS.organization}`;

let database: TestDatabase;
const apps: INestApplication[] = [];

async function appFor(options: Parameters<typeof createApp>[0]) {
  const app = await createApp(options);
  apps.push(app);
  return app;
}

beforeAll(async () => {
  database = await createSeededDatabase();
  await database.query(
    "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, 'autre', 'autre', now(), now())",
    [OTHER_ORG],
  );
  await database.query(
    "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, 'Projet autre org', now(), now())",
    [OTHER_PROJECT, OTHER_ORG],
  );
  await insertUser(database, OUTSIDER, "outsider@example.test");
});

afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
  await database?.dispose();
});

describe("garde de session — sans session (C1)", () => {
  it("C1.a aucun cookie ni en-tête : 401 UNAUTHORIZED sans lire la base", async () => {
    // Base injoignable : un 401 (et non un 500) prouve que le service n'a pas été appelé.
    const app = await appFor({ databaseUrl: UNREACHABLE_DATABASE_URL });
    const response = await request(app.getHttpServer()).get("/projects");
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
    expect(response.body.status).toBe(401);
  });

  it("C1.b cookie de session inconnu ou signature forgée : 401 UNAUTHORIZED", async () => {
    const app = await appFor({ databaseUrl: database.url });
    const unknown = await request(app.getHttpServer())
      .get("/projects")
      .set("Cookie", signedSessionCookie("jeton-inconnu"));
    expect(unknown.status).toBe(401);
    expect(unknown.body.code).toBe("UNAUTHORIZED");

    const validToken = await insertSession(database, {
      userId: SEED_IDS.adminUser,
      activeOrganizationId: SEED_IDS.organization,
    });
    const token = decodeURIComponent(validToken.slice(`${SESSION_COOKIE}=`.length)).split(".")[0];
    const forged = await request(app.getHttpServer())
      .get("/projects")
      .set("Cookie", `${SESSION_COOKIE}=${encodeURIComponent(`${token}.signature-forgee`)}`);
    expect(forged.status).toBe(401);
    expect(forged.body.code).toBe("UNAUTHORIZED");
  });

  it("C1.b session expirée : 401 UNAUTHORIZED", async () => {
    const cookie = await insertSession(database, {
      userId: SEED_IDS.adminUser,
      activeOrganizationId: SEED_IDS.organization,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const app = await appFor({ databaseUrl: database.url });
    const response = await request(app.getHttpServer()).get("/projects").set("Cookie", cookie);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });
});

describe("session de test (C2)", () => {
  it("C2.a APP_ENV=test + x-test-session valide : 200 et projets de l'organisation", async () => {
    const app = await appFor({ databaseUrl: database.url });
    const response = await request(app.getHttpServer())
      .get("/projects")
      .set("x-test-session", TEST_SESSION);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(SEED_PROJECTS);
  });

  it.each(["development", "production"] as const)(
    "C2.b APP_ENV=%s + la même session de test : 401 UNAUTHORIZED",
    async (appEnv) => {
      const app = await appFor({ databaseUrl: database.url, appEnv });
      const response = await request(app.getHttpServer())
        .get("/projects")
        .set("x-test-session", TEST_SESSION);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe("UNAUTHORIZED");
    },
  );

  it("C2.c le fournisseur de session de test n'est enregistré qu'en test", async () => {
    const inTest = await appFor({ databaseUrl: database.url });
    expect(inTest.get(TEST_SESSION_RESOLVER, { strict: false })).toBeDefined();
    for (const appEnv of ["development", "production"] as const) {
      const app = await appFor({ databaseUrl: database.url, appEnv });
      expect(() => app.get(TEST_SESSION_RESOLVER, { strict: false })).toThrow();
    }
  });

  it("C2.e en-tête x-test-session mal formé : 401 UNAUTHORIZED, jamais de 500", async () => {
    const app = await appFor({ databaseUrl: database.url });
    for (const value of ["", "seulement-un-id", ":", `${SEED_IDS.adminUser}:`, "a:b:c"]) {
      const response = await request(app.getHttpServer())
        .get("/projects")
        .set("x-test-session", value);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe("UNAUTHORIZED");
    }
  });
});

describe("session réelle Better Auth et organisation (C4)", () => {
  it("C4 cookie valide d'un membre : projets de l'organisation active de la session", async () => {
    const cookie = await insertSession(database, {
      userId: SEED_IDS.adminUser,
      activeOrganizationId: SEED_IDS.organization,
    });
    const app = await appFor({ databaseUrl: database.url });
    const response = await request(app.getHttpServer()).get("/projects").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(SEED_PROJECTS);
  });

  it("C4 le cookie réel fonctionne aussi hors test (production)", async () => {
    const cookie = await insertSession(database, {
      userId: SEED_IDS.adminUser,
      activeOrganizationId: SEED_IDS.organization,
    });
    const app = await appFor({ databaseUrl: database.url, appEnv: "production" });
    const response = await request(app.getHttpServer()).get("/projects").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(SEED_PROJECTS);
  });

  it("C4.a l'organisation fournie par le client (en-tête, query, corps) est ignorée", async () => {
    const cookie = await insertSession(database, {
      userId: SEED_IDS.adminUser,
      activeOrganizationId: SEED_IDS.organization,
    });
    const app = await appFor({ databaseUrl: database.url });
    const response = await request(app.getHttpServer())
      .get(`/projects?organizationId=${OTHER_ORG}`)
      .set("Cookie", cookie)
      .set("x-organization-id", OTHER_ORG)
      .set("x-organization", OTHER_ORG)
      .send({ organizationId: OTHER_ORG });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(SEED_PROJECTS);
    expect(JSON.stringify(response.body)).not.toContain(OTHER_PROJECT);
  });

  it("C4.a un cookie de session l'emporte : x-test-session d'une autre org est ignoré hors test", async () => {
    const cookie = await insertSession(database, {
      userId: SEED_IDS.adminUser,
      activeOrganizationId: SEED_IDS.organization,
    });
    const app = await appFor({ databaseUrl: database.url, appEnv: "production" });
    const response = await request(app.getHttpServer())
      .get("/projects")
      .set("Cookie", cookie)
      .set("x-test-session", `${SEED_IDS.adminUser}:${OTHER_ORG}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(SEED_PROJECTS);
  });
});

describe("session réelle : refus et isolation (C4.b, C4.c)", () => {
  it("C4.b session valide sans organisation active : 401 UNAUTHORIZED, aucune liste", async () => {
    const cookie = await insertSession(database, {
      userId: SEED_IDS.adminUser,
      activeOrganizationId: null,
    });
    const app = await appFor({ databaseUrl: database.url });
    const response = await request(app.getHttpServer()).get("/projects").set("Cookie", cookie);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
    expect(JSON.stringify(response.body)).not.toContain("Projet");
  });

  it("C4.c utilisateur non membre de l'organisation active : 401 UNAUTHORIZED, pas de fuite", async () => {
    const cookie = await insertSession(database, {
      userId: OUTSIDER,
      activeOrganizationId: SEED_IDS.organization,
    });
    const app = await appFor({ databaseUrl: database.url });
    const response = await request(app.getHttpServer()).get("/projects").set("Cookie", cookie);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
    expect(JSON.stringify(response.body)).not.toContain("Projet de démo");
  });

  it("C4.c l'isolation reste vraie : un membre d'une autre organisation ne voit que la sienne", async () => {
    const memberOfOther = randomUUID();
    await insertUser(database, memberOfOther, `${memberOfOther}@example.test`);
    await insertMember(database, OTHER_ORG, memberOfOther, "owner");
    const cookie = await insertSession(database, {
      userId: memberOfOther,
      activeOrganizationId: OTHER_ORG,
    });
    const app = await appFor({ databaseUrl: database.url });
    const response = await request(app.getHttpServer()).get("/projects").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: OTHER_PROJECT, name: "Projet autre org" }]);
  });
});

describe("routes publiques et contrat (C5, C7)", () => {
  it("C5 /health et /openapi.json restent publics (garde par procédure, pas global)", async () => {
    const app = await appFor({ databaseUrl: database.url });
    const health = await request(app.getHttpServer()).get("/health");
    expect(health.status).toBe(200);
    const openapi = await request(app.getHttpServer()).get("/openapi.json");
    expect(openapi.status).toBe(200);
  });

  it("C5 /health reste public aussi en production", async () => {
    const app = await appFor({ databaseUrl: database.url, appEnv: "production" });
    expect((await request(app.getHttpServer()).get("/health")).status).toBe(200);
  });

  it("C7 le document OpenAPI déclare l'erreur UNAUTHORIZED (401) sur /projects", async () => {
    const document = JSON.parse(JSON.stringify(await generateOpenApi()));
    expect(Object.keys(document.paths["/projects"].get.responses)).toContain("401");
  });
});
