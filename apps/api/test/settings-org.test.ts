import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene } from "./helpers/client-scene.ts";
import { insertActor, insertOrganization } from "./helpers/organizations.ts";
import { auditActions, settingsApi } from "./helpers/settings.ts";

/** TK-97 (cas 2, 3) : `org.get` et `org.update`, droits vérifiés côté serveur, audit exact. */
let database: TestDatabase;
let app: INestApplication;
let scene: ClientScene;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

describe("org.get", () => {
  it("rend nom, slug, compteurs réels de projets et de membres, sans fournisseur d'IA", async () => {
    const res = await settingsApi(app, scene.staff.owner).orgGet();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      id: scene.organizationId,
      logo: null,
      projectCount: 3,
      memberCount: 8,
      aiProviderCount: 0,
    });
    expect(res.body.slug).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/anthropic|openai|mistral/i);
  });

  it.each(["owner", "admin", "dev", "designer", "business"] as const)("%s : 200", async (role) => {
    expect((await settingsApi(app, scene.staff[role]).orgGet()).status).toBe(200);
  });

  it("client (lié ou non) : 403 ; sans session : 401", async () => {
    expect((await settingsApi(app, scene.c1).orgGet()).status).toBe(403);
    expect((await settingsApi(app, scene.c3).orgGet()).status).toBe(403);
    expect((await settingsApi(app, undefined).orgGet()).status).toBe(401);
  });

  it("ne rend que l'organisation de la session", async () => {
    const res = await settingsApi(app, scene.foreign.owner).orgGet();
    expect(res.body.id).toBe(scene.foreign.organizationId);
    expect(res.body.projectCount).toBe(1);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("org.update", () => {
  it("l'owner change nom et slug : une entrée d'audit organization.update", async () => {
    const org = await insertOrganization(database, `reglages-${Date.now()}`);
    const owner = await insertActor(database, org, "owner");
    const res = await settingsApi(app, owner).orgUpdate({
      name: "Atelier Nord",
      slug: `nord-${Date.now()}`,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ id: org, name: "Atelier Nord" });
    expect(await auditActions(database, org)).toEqual(["organization.update"]);
    const [row] = await database.query<{ name: string; slug: string }>(
      "SELECT name, slug FROM organizations WHERE id = $1",
      [org],
    );
    expect(row?.name).toBe("Atelier Nord");
  });

  it("l'admin peut aussi ; garder son propre slug n'est pas un doublon", async () => {
    const org = await insertOrganization(database, `reglages-admin-${Date.now()}`);
    const admin = await insertActor(database, org, "admin");
    const [row] = await database.query<{ slug: string }>(
      "SELECT slug FROM organizations WHERE id = $1",
      [org],
    );
    const res = await settingsApi(app, admin).orgUpdate({ name: "Nouveau nom", slug: row?.slug });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("slug déjà pris par une autre organisation : 409 slug_taken, rien n'est écrit", async () => {
    const other = await insertOrganization(database, `deja-pris-${Date.now()}`);
    const [taken] = await database.query<{ slug: string }>(
      "SELECT slug FROM organizations WHERE id = $1",
      [other],
    );
    const org = await insertOrganization(database, `doublon-${Date.now()}`);
    const owner = await insertActor(database, org, "owner");
    const res = await settingsApi(app, owner).orgUpdate({ name: "X", slug: taken?.slug });
    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ reason: "slug_taken" });
    expect(await auditActions(database, org)).toEqual([]);
  });

  it.each(["dev", "designer", "business"] as const)(
    "%s : 403 et rien n'est modifié",
    async (role) => {
      const res = await settingsApi(app, scene.staff[role]).orgUpdate({
        name: "Piraté",
        slug: "pirate-x",
      });
      expect(res.status).toBe(403);
      const [row] = await database.query<{ name: string }>(
        "SELECT name FROM organizations WHERE id = $1",
        [scene.organizationId],
      );
      expect(row?.name).not.toBe("Piraté");
    },
  );

  it("client : 403 ; slug mal formé ou nom vide : 422", async () => {
    expect(
      (await settingsApi(app, scene.c1).orgUpdate({ name: "X", slug: "ok-slug" })).status,
    ).toBe(403);
    expect(
      (await settingsApi(app, scene.staff.owner).orgUpdate({ name: "X", slug: "Pas Bon" })).status,
    ).toBe(422);
    expect(
      (await settingsApi(app, scene.staff.owner).orgUpdate({ name: "", slug: "ok-slug" })).status,
    ).toBe(422);
  });
});
