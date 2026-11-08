import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene } from "./helpers/client-scene.ts";
import { ideaApi, pageIdOf, seedIdeaTemplate } from "./helpers/idea.ts";

/** TK-89 lot A (décision 7) : contributeurs alimentés à l'enregistrement, au renommage et à la création. */
let database: TestDatabase;
let app: INestApplication;
let scene: ClientScene;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
  await seedIdeaTemplate(database, {
    organizationId: scene.organizationId,
    projectId: scene.projects.p1,
  });
}, 120_000);
afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const contributorsOf = (pageId: string) =>
  database.query<{ user_id: string }>(
    "SELECT user_id FROM idea_page_contributors WHERE page_id = $1 ORDER BY user_id",
    [pageId],
  );

describe("idea_page_contributors", () => {
  it("save ajoute l'auteur une seule fois, plusieurs auteurs s'additionnent (client compris)", async () => {
    const p = scene.projects.p1;
    const id = await pageIdOf(database, p, "vision");
    const owner = ideaApi(app, scene.staff.owner);
    const client = ideaApi(app, scene.c1);
    await owner.save(p, id, 1, "un");
    await owner.save(p, id, 2, "deux");
    await client.save(p, id, 3, "trois");
    const expected = [scene.staff.owner.userId, scene.c1.userId].sort();
    expect((await contributorsOf(id)).map((r) => r.user_id)).toEqual(expected);
  });

  it("rename et create ajoutent leur auteur ; un refus de version n'ajoute personne", async () => {
    const p = scene.projects.p1;
    const dev = ideaApi(app, scene.staff.dev);
    const created = await dev.create(p, "Contributions");
    expect((await contributorsOf(created.body.id)).map((r) => r.user_id)).toEqual([
      scene.staff.dev.userId,
    ]);
    const id = await pageIdOf(database, p, "mesure");
    await ideaApi(app, scene.staff.designer).rename(p, id, "Mesures");
    expect((await contributorsOf(id)).map((r) => r.user_id)).toEqual([scene.staff.designer.userId]);
    const stale = await ideaApi(app, scene.staff.admin).save(p, id, 99, "périmé");
    expect(stale.status).toBe(409);
    expect((await contributorsOf(id)).map((r) => r.user_id)).toEqual([scene.staff.designer.userId]);
  });
});
