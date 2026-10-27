import { projectListOutputSchema } from "@koklo/contract";
import { SEED_IDS } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase, UNREACHABLE_DATABASE_URL } from "./helpers/app.ts";

const OTHER_ORG = "01900000-0000-7000-8000-0000000000a1";
const OTHER_PROJECT = "01900000-0000-7000-8000-0000000000a2";
const EMPTY_ORG = "01900000-0000-7000-8000-0000000000b1";
const EARLY = "01900000-0000-7000-8000-0000000000c1";
const LATE = "01900000-0000-7000-8000-0000000000c2";

let database: TestDatabase;
const apps: INestApplication[] = [];

async function appFor(organizationId?: string, databaseUrl = database.url) {
  const app = await createApp({ databaseUrl, organizationId });
  apps.push(app);
  return app;
}

async function insertOrganization(id: string, slug: string) {
  await database.query(
    "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, now(), now())",
    [id, slug, slug],
  );
}

async function insertProject(id: string, organizationId: string, name: string, createdAt: string) {
  await database.query(
    "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)",
    [id, organizationId, name, createdAt],
  );
}

beforeAll(async () => {
  database = await createSeededDatabase();
  await insertOrganization(OTHER_ORG, "autre");
  await insertProject(OTHER_PROJECT, OTHER_ORG, "Projet de l'autre organisation", "2026-02-01");
  await insertOrganization(EMPTY_ORG, "vide");
});

afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
  await database?.dispose();
});

describe("project.list — GET /projects (critère 1)", () => {
  it("C1.1 renvoie exactement les projets du seed, sans champ en plus", async () => {
    const app = await appFor(SEED_IDS.organization);
    const response = await request(app.getHttpServer()).get("/projects");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: SEED_IDS.project, name: "Projet de démo" }]);
  });

  it("C1.2 la réponse valide projectListOutputSchema du contrat", async () => {
    const app = await appFor(SEED_IDS.organization);
    const response = await request(app.getHttpServer()).get("/projects");
    expect(projectListOutputSchema.safeParse(response.body).success).toBe(true);
  });

  it("C1.3 isole les organisations dans les deux sens", async () => {
    const own = await request((await appFor(SEED_IDS.organization)).getHttpServer()).get(
      "/projects",
    );
    expect(own.body.map((p: { id: string }) => p.id)).not.toContain(OTHER_PROJECT);
    const other = await request((await appFor(OTHER_ORG)).getHttpServer()).get("/projects");
    expect(other.body).toEqual([{ id: OTHER_PROJECT, name: "Projet de l'autre organisation" }]);
  });

  it("C1.4 trie par createdAt puis id, de façon déterministe", async () => {
    const org = "01900000-0000-7000-8000-0000000000d1";
    await insertOrganization(org, "tri");
    await insertProject(LATE, org, "Tardif", "2026-03-02");
    await insertProject(EARLY, org, "Précoce", "2026-03-01");
    await insertProject(
      "01900000-0000-7000-8000-0000000000c0",
      org,
      "Même date, id plus petit",
      "2026-03-02",
    );
    const response = await request((await appFor(org)).getHttpServer()).get("/projects");
    expect(response.body.map((p: { name: string }) => p.name)).toEqual([
      "Précoce",
      "Même date, id plus petit",
      "Tardif",
    ]);
  });

  it("C1.5 organisation sans projet : 200 et []", async () => {
    const response = await request((await appFor(EMPTY_ORG)).getHttpServer()).get("/projects");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});

describe("project.list — accès refusé et erreurs (critère 1)", () => {
  it("C1.6 câblage par défaut : 401 UNAUTHORIZED sans lire la base", async () => {
    // Base injoignable : un 401 (et non un 500) prouve qu'aucune lecture n'a eu lieu.
    const app = await appFor(undefined, UNREACHABLE_DATABASE_URL);
    const response = await request(app.getHttpServer()).get("/projects");
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("C1.7 erreur du repository : 500 INTERNAL avec requestId, sans détail interne", async () => {
    const app = await appFor(SEED_IDS.organization, UNREACHABLE_DATABASE_URL);
    const response = await request(app.getHttpServer()).get("/projects");
    expect(response.status).toBe(500);
    expect(response.body.code).toBe("INTERNAL");
    expect(response.body.data.requestId).toEqual(expect.any(String));
    expect(response.body.data.requestId).not.toBe("");
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("secret-pw");
    expect(serialized).not.toContain("127.0.0.1");
    expect(serialized).not.toMatch(/ECONNREFUSED|prisma|postgresql:\/\//i);
  });

  it("C1.9 utilise la vraie base : un projet inséré après le démarrage est visible", async () => {
    const app = await appFor(EMPTY_ORG);
    await insertProject(
      "01900000-0000-7000-8000-0000000000e1",
      EMPTY_ORG,
      "Ajouté en cours",
      "2026-04-01",
    );
    const response = await request(app.getHttpServer()).get("/projects");
    expect(response.body).toEqual([
      { id: "01900000-0000-7000-8000-0000000000e1", name: "Ajouté en cours" },
    ]);
  });
});
