import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene } from "./helpers/client-scene.ts";
import { ideaApi, pageIdOf, seedIdeaTemplate } from "./helpers/idea.ts";

/** TK-89 lot A (T14, décision 5) : présence en base, active si vue depuis moins de 45 s. */
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

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("idea.presence", () => {
  it("touch puis liste : chacun se voit, voit les autres, sans identifiant ni e-mail", async () => {
    const p = scene.projects.p1;
    const page = await pageIdOf(database, p, "perimetre");
    await ideaApi(app, scene.staff.owner).presence(p, page);
    const client = await ideaApi(app, scene.c1).presence(p, page);
    expect(client.status).toBe(200);
    const present = client.body.present as {
      name: string;
      isClient: boolean;
      mine: boolean;
      pageId: string;
      initials: string;
    }[];
    expect(present).toHaveLength(2);
    const me = present.find((x) => x.mine);
    expect(me).toMatchObject({ name: scene.c1.name, isClient: true, pageId: page });
    expect(present.find((x) => !x.mine)).toMatchObject({
      name: scene.staff.owner.name,
      isClient: false,
    });
    expect(me?.initials).toMatch(/^[A-ZÀ-Ý]{1,2}$/);
    const text = JSON.stringify(client.body);
    expect(text).not.toContain(scene.staff.owner.email);
    expect(text).not.toContain(scene.staff.owner.userId);
  });

  it("une ligne par (projet, membre) : un second signal met à jour la page ouverte", async () => {
    const p = scene.projects.p1;
    const owner = ideaApi(app, scene.staff.owner);
    await owner.presence(p, await pageIdOf(database, p, "vision"));
    await owner.presence(p, null);
    const rows = await database.query<{ page_id: string | null }>(
      "SELECT page_id FROM idea_presence WHERE project_id = $1 AND user_id = $2",
      [p, scene.staff.owner.userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.page_id).toBeNull();
  });

  it("expiration : une présence vue il y a 45 s ou plus n'est plus rendue", async () => {
    const p = scene.projects.p1;
    await ideaApi(app, scene.staff.dev).presence(p);
    await database.query(
      "UPDATE idea_presence SET seen_at = now() - interval '46 seconds' WHERE project_id = $1 AND user_id = $2",
      [p, scene.staff.dev.userId],
    );
    const res = await ideaApi(app, scene.staff.admin).presence(p);
    const names = (res.body.present as { name: string }[]).map((x) => x.name);
    expect(names).not.toContain(scene.staff.dev.name);
    expect(names).toContain(scene.staff.admin.name);
  });

  it("une page d'un autre projet est refusée (VALIDATION) et rien n'est écrit", async () => {
    const res = await ideaApi(app, scene.staff.designer).presence(
      scene.projects.p1,
      "99999999-9999-4999-8999-999999999999",
    );
    expect(res.status).toBe(422);
    const rows = await database.query(
      "SELECT 1 FROM idea_presence WHERE project_id = $1 AND user_id = $2",
      [scene.projects.p1, scene.staff.designer.userId],
    );
    expect(rows).toHaveLength(0);
  });

  it("un client non lié reçoit 404 et ne laisse aucune trace", async () => {
    const res = await ideaApi(app, scene.c3).presence(scene.projects.p1);
    expect(res.status).toBe(404);
    const rows = await database.query("SELECT 1 FROM idea_presence WHERE user_id = $1", [
      scene.c3.userId,
    ]);
    expect(rows).toHaveLength(0);
  });
});
