import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene } from "./helpers/client-scene.ts";
import { ideaApi, ideaRows } from "./helpers/idea.ts";
import { send } from "./helpers/tickets.ts";

/** TK-89 lot A (T7) : la création d'un projet pose les 10 pages du gabarit dans la même transaction. */
let database: TestDatabase;
let app: INestApplication;
let scene: ClientScene;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
}, 120_000);
afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

describe("project.create : gabarit « cadrage par défaut »", () => {
  it("pose 10 pages vides, 4 requises, positions 0 à 9, origine gabarit", async () => {
    const created = await send(app, scene.staff.owner.cookie, "post", "/projects", {
      name: "Nouveau",
    });
    expect(created.status).toBe(200);
    const rows = await ideaRows(database, created.body.id);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rows.filter((r) => r.required).map((r) => r.slug)).toEqual([
      "vision",
      "probleme",
      "utilisateurs",
      "perimetre",
    ]);
    expect(
      rows.every((r) => r.origin === "template" && r.status === "empty" && r.content_md === ""),
    ).toBe(true);
    expect(rows.every((r) => r.version === 1 && r.deleted_at === null)).toBe(true);
    const list = await ideaApi(app, scene.staff.owner).list(created.body.id);
    expect(list.body.total).toBe(10);
  });

  it("l'organisation de chaque page est celle du projet", async () => {
    const created = await send(app, scene.staff.admin.cookie, "post", "/projects", {
      name: "Autre",
    });
    const rows = await database.query<{ organization_id: string }>(
      "SELECT DISTINCT organization_id FROM idea_pages WHERE project_id = $1",
      [created.body.id],
    );
    expect(rows).toEqual([{ organization_id: scene.organizationId }]);
  });

  it("tout ou rien : si la création des pages échoue, le projet n'existe pas", async () => {
    await database.query(
      `CREATE OR REPLACE FUNCTION idea_pages_fail() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'échec simulé'; END; $$ LANGUAGE plpgsql`,
    );
    await database.query(
      "CREATE TRIGGER idea_pages_fail BEFORE INSERT ON idea_pages FOR EACH ROW EXECUTE FUNCTION idea_pages_fail()",
    );
    try {
      const res = await send(app, scene.staff.owner.cookie, "post", "/projects", {
        name: "Voué à l'échec",
      });
      expect(res.status).toBe(500);
      const rows = await database.query("SELECT 1 FROM projects WHERE name = $1", [
        "Voué à l'échec",
      ]);
      expect(rows).toHaveLength(0);
    } finally {
      await database.query("DROP TRIGGER idea_pages_fail ON idea_pages");
    }
  });
});
