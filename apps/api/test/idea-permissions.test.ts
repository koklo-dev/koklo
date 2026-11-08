import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene, STAFF } from "./helpers/client-scene.ts";
import { ideaApi, ideaRows, pageIdOf, seedIdeaTemplate } from "./helpers/idea.ts";

/**
 * TK-89 lot A (T11, décisions 1 et 2) : le client rédige sans publier, le business lit seulement ;
 * le client non lié et l'autre organisation voient un 404 uniforme. Rôles vérifiés côté serveur.
 */
let database: TestDatabase;
let app: INestApplication;
let scene: ClientScene;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
  for (const projectId of [scene.projects.p1, scene.foreign.projectId]) {
    const organizationId =
      projectId === scene.foreign.projectId ? scene.foreign.organizationId : scene.organizationId;
    await seedIdeaTemplate(database, { organizationId, projectId });
  }
}, 120_000);
afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const p1 = () => scene.projects.p1;
const WRITERS = ["owner", "admin", "dev", "designer"] as const;

describe("lecture : staff, business et client lié", () => {
  it.each([...STAFF, "client"] as const)("%s lit la liste et une page de p1", async (role) => {
    const actor = role === "client" ? scene.c1 : scene.staff[role];
    const api = ideaApi(app, actor);
    const list = await api.list(p1());
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(10);
    const id = await pageIdOf(database, p1(), "vision");
    expect((await api.get(p1(), id)).status).toBe(200);
  });

  it("sans session : 401", async () => {
    expect((await ideaApi(app, undefined).list(p1())).status).toBe(401);
  });
});

describe("écriture : équipe et client oui, business non", () => {
  it.each([...WRITERS, "client"] as const)("%s rédige, crée, renomme et supprime", async (role) => {
    const actor = role === "client" ? scene.c1 : scene.staff[role];
    const api = ideaApi(app, actor);
    const vision = await pageIdOf(database, p1(), "vision");
    const row = (await api.get(p1(), vision)).body;
    const saved = await api.save(p1(), vision, row.version, `Écrit par ${role}`);
    expect(saved.status).toBe(200);
    expect(saved.body.updatedBy).toEqual({ name: actor.name, isClient: role === "client" });
    const created = await api.create(p1(), `Page de ${role}`);
    expect(created.status).toBe(200);
    expect((await api.rename(p1(), created.body.id, `Renommée ${role}`)).status).toBe(200);
    expect((await api.remove(p1(), created.body.id)).status).toBe(200);
    expect((await api.restore(p1(), created.body.id)).status).toBe(200);
  });

  it("business : lecture seule, toute écriture est FORBIDDEN et la base ne bouge pas", async () => {
    const api = ideaApi(app, scene.staff.business);
    const id = await pageIdOf(database, p1(), "probleme");
    const before = await ideaRows(database, p1());
    const attempts = [
      await api.save(p1(), id, 1, "x"),
      await api.setStatus(p1(), id, "draft"),
      await api.create(p1(), "Nouvelle"),
      await api.rename(p1(), id, "Autre"),
      await api.reorder(
        p1(),
        before.map((r) => r.id),
      ),
      await api.remove(p1(), await pageIdOf(database, p1(), "glossaire")),
      await api.restore(p1(), id),
      await api.presence(p1(), id),
      await api.publish(p1(), "k-1"),
    ];
    for (const res of attempts) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    expect(await ideaRows(database, p1())).toEqual(before);
  });
});

describe("publication : ni le client ni le business", () => {
  it.each(["client", "business"] as const)("%s ne publie pas : 403, aucun lot", async (role) => {
    const actor = role === "client" ? scene.c1 : scene.staff.business;
    const res = await ideaApi(app, actor).publish(p1(), `k-${randomUUID()}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    const batches = await database.query("SELECT 1 FROM spec_write_batches WHERE project_id = $1", [
      p1(),
    ]);
    expect(batches).toHaveLength(0);
  });
});

describe("cloisonnement : 404 uniforme", () => {
  it("client non lié (c3) : 404 en lecture comme en écriture, même corps qu'un projet inconnu", async () => {
    const api = ideaApi(app, scene.c3);
    const id = await pageIdOf(database, p1(), "vision");
    const known = await api.list(p1());
    const unknown = await api.list(randomUUID());
    expect(known.status).toBe(404);
    expect(known.body).toEqual(unknown.body);
    expect((await api.get(p1(), id)).status).toBe(404);
    expect((await api.save(p1(), id, 1, "x")).status).toBe(404);
    expect((await api.create(p1(), "x")).status).toBe(404);
    expect((await api.presence(p1())).status).toBe(404);
  });

  it("client lié à p1 : p2 est introuvable", async () => {
    expect((await ideaApi(app, scene.c1).list(scene.projects.p2)).status).toBe(404);
  });

  it("autre organisation : le projet et ses pages sont introuvables, et réciproquement", async () => {
    const foreign = ideaApi(app, scene.foreign.owner);
    expect((await foreign.list(p1())).status).toBe(404);
    const theirs = await pageIdOf(database, scene.foreign.projectId, "vision");
    expect(
      (await ideaApi(app, scene.staff.owner).get(scene.foreign.projectId, theirs)).status,
    ).toBe(404);
    expect((await ideaApi(app, scene.staff.owner).get(p1(), theirs)).status).toBe(404);
    expect((await foreign.list(scene.foreign.projectId)).status).toBe(200);
  });
});
