import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene, linkClient, STAFF } from "./helpers/client-scene.ts";
import { insertActor } from "./helpers/organizations.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-55a : `project.list` cloisonné. Aujourd'hui un `client` voit TOUS les projets de son
 * organisation (faille existante) ; il ne voit que ceux auxquels il est lié. Les rôles d'équipe et
 * le business gardent toute l'organisation. Fail-closed : rôle absent ou inconnu = cloisonné.
 */
let database: TestDatabase;
let app: INestApplication;
let scene: ClientScene;
const apps: INestApplication[] = [];

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
});

afterAll(async () => {
  await Promise.all([app, ...apps].map((a) => a?.close()));
  await database?.dispose();
});

const idsOf = (body: { id: string }[]) => body.map((p) => p.id).sort();
const listAs = (cookie: string | undefined) => send(app, cookie, "get", "/projects");

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("project.list : matrice des six rôles", () => {
  it.each(STAFF)(
    "%s voit les trois projets de son organisation, jamais ceux d'une autre",
    async (role) => {
      const res = await listAs(scene.staff[role].cookie);
      expect(res.status).toBe(200);
      expect(idsOf(res.body)).toEqual(
        [scene.projects.old, scene.projects.p1, scene.projects.p2].sort(),
      );
      expect(JSON.stringify(res.body)).not.toContain(scene.foreign.projectId);
    },
  );

  it("client lié à p1 : voit uniquement p1", async () => {
    const res = await listAs(scene.c1.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: scene.projects.p1, name: "Projet client 1" }]);
  });

  it("deux clients de la même organisation liés à des projets différents ne se voient pas", async () => {
    const one = await listAs(scene.c1.cookie);
    const two = await listAs(scene.c2.cookie);
    expect(idsOf(one.body)).toEqual([scene.projects.p1]);
    expect(idsOf(two.body)).toEqual([scene.projects.p2]);
    expect(JSON.stringify(one.body)).not.toContain("Projet client 2");
    expect(JSON.stringify(two.body)).not.toContain("Projet client 1");
  });

  it("client sans aucun lien : 200 et liste vide (jamais une erreur)", async () => {
    const res = await listAs(scene.c3.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("client lié à deux projets : voit les deux, dans l'ordre createdAt puis id", async () => {
    const both = await insertActor(database, scene.organizationId, "client", "client-both");
    await linkClient(database, scene.organizationId, scene.projects.p2, both.userId);
    await linkClient(database, scene.organizationId, scene.projects.p1, both.userId);
    const res = await listAs(both.cookie);
    expect(res.body.map((p: { id: string }) => p.id)).toEqual([
      scene.projects.p1,
      scene.projects.p2,
    ]);
  });

  it("client d'une autre organisation : voit son projet lié, aucun de l'organisation A", async () => {
    const res = await listAs(scene.foreign.client.cookie);
    expect(res.body).toEqual([{ id: scene.foreign.projectId, name: "Projet étranger" }]);
  });

  it("un lien posé dans une autre organisation pour le même utilisateur n'ouvre rien ici", async () => {
    const dual = await insertActor(database, scene.organizationId, "client", "client-dual");
    // Membre `client` aussi dans l'organisation étrangère, lié là-bas seulement.
    await database.query(
      `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, 'client', now(), now())`,
      [randomUUID(), scene.foreign.organizationId, dual.userId],
    );
    await linkClient(database, scene.foreign.organizationId, scene.foreign.projectId, dual.userId);
    const res = await listAs(dual.cookie);
    expect(res.body).toEqual([]);
  });

  it("sans session : 401, comme avant", async () => {
    expect((await listAs(undefined)).status).toBe(401);
  });
});

describe("project.list : le rôle et les liens sont relus à chaque requête", () => {
  it("retirer le lien d'un client vide sa liste au prochain appel", async () => {
    const actor = await insertActor(
      database,
      scene.organizationId,
      "client",
      "client-unlinked-later",
    );
    await linkClient(database, scene.organizationId, scene.projects.p1, actor.userId);
    expect(idsOf((await listAs(actor.cookie)).body)).toEqual([scene.projects.p1]);
    await database.query("DELETE FROM project_client_access WHERE user_id = $1", [actor.userId]);
    expect((await listAs(actor.cookie)).body).toEqual([]);
  });

  it("un membre d'équipe rétrogradé en client perd la vue d'ensemble avec sa session existante", async () => {
    const actor = await insertActor(database, scene.organizationId, "dev", "dev-demoted");
    expect((await listAs(actor.cookie)).body).toHaveLength(3);
    await database.query("UPDATE members SET role = 'client' WHERE id = $1", [actor.memberId]);
    expect((await listAs(actor.cookie)).body).toEqual([]);
  });

  it("un client promu en dev voit toute l'organisation avec sa session existante", async () => {
    const res = await listAs(scene.c3.cookie);
    expect(res.body).toEqual([]);
    const actor = await insertActor(database, scene.organizationId, "client", "client-promoted");
    await database.query("UPDATE members SET role = 'dev' WHERE id = $1", [actor.memberId]);
    expect((await listAs(actor.cookie)).body).toHaveLength(3);
  });
});

describe("project.list : fail-closed sur un rôle absent ou inconnu", () => {
  async function fixedApp(role?: string) {
    const fixed = await createApp({
      databaseUrl: database.url,
      organizationId: scene.organizationId,
      ...(role === undefined ? {} : { role }),
    });
    apps.push(fixed);
    return fixed;
  }

  it("session SANS rôle (AuthSession.role absent) : liste vide, pas toute l'organisation", async () => {
    const res = await request((await fixedApp()).getHttpServer()).get("/projects");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each(["member", "", "Owner", "superuser"])("rôle inconnu %j : liste vide", async (role) => {
    const res = await request((await fixedApp(role)).getHttpServer()).get("/projects");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each(STAFF)("rôle d'équipe %s dans une session fixe : toute l'organisation", async (role) => {
    const res = await request((await fixedApp(role)).getHttpServer()).get("/projects");
    expect(idsOf(res.body)).toHaveLength(3);
  });

  it("session de test par en-tête : le rôle est relu en base (client lié = ses projets)", async () => {
    const res = await request(app.getHttpServer())
      .get("/projects")
      .set("x-test-session", `${scene.c1.userId}:${scene.organizationId}`);
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual([scene.projects.p1]);
  });

  it("session de test par en-tête d'un membre d'équipe : toute l'organisation", async () => {
    const res = await request(app.getHttpServer())
      .get("/projects")
      .set("x-test-session", `${scene.staff.dev.userId}:${scene.organizationId}`);
    expect(idsOf(res.body)).toHaveLength(3);
  });

  it("session de test par en-tête d'un utilisateur qui n'est pas membre : liste vide", async () => {
    const res = await request(app.getHttpServer())
      .get("/projects")
      .set("x-test-session", `${randomUUID()}:${scene.organizationId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("project.list : projection", () => {
  it("un client ne reçoit que { id, name } par projet, rien d'autre", async () => {
    const res = await listAs(scene.c1.cookie);
    for (const project of res.body) expect(Object.keys(project).sort()).toEqual(["id", "name"]);
  });
});
