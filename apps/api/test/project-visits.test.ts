import type { TestDatabase } from "@koklo/db/testing";
import { projectTileOf } from "@koklo/domain";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { stripRequestId } from "./helpers/client-scene.ts";
import { shellApi } from "./helpers/shell.ts";
import { createWorld, insertProject, linkClient } from "./helpers/tickets.ts";

/**
 * TK-88 lot A (A7, A8) : `project.visit` (POST /projects/{projectId}/visit, upsert) et
 * `project.recent` (GET /project-visits, 8 projets accessibles au plus). Une préférence personnelle :
 * tout rôle ayant accès au projet peut l'écrire, deux membres ne se voient pas.
 */
let database: TestDatabase;
let app: INestApplication;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const rows = (userId: string) =>
  database.query<{ project_id: string; visited_at: Date }>(
    "SELECT project_id, visited_at FROM project_visits WHERE user_id = $1 ORDER BY project_id",
    [userId],
  );
const namesOf = (body: { name: string }[]) => body.map((p) => p.name);
const pause = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("A7 project.visit", () => {
  it("enregistre l'ouverture et répond l'instant ; la deuxième visite rafraîchit sans doubler", async () => {
    const world = await createWorld(database);
    const dev = world.actors.dev;
    const first = await shellApi(app, dev).visit(world.projectId);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(Number.isNaN(Date.parse(first.body.visitedAt))).toBe(false);
    const [one] = await rows(dev.userId);
    await pause();
    const second = await shellApi(app, dev).visit(world.projectId);
    expect(second.status).toBe(200);
    const after = await rows(dev.userId);
    expect(after).toHaveLength(1);
    expect(after[0]?.visited_at.getTime()).toBeGreaterThan(one?.visited_at.getTime() ?? 0);
    expect(Date.parse(second.body.visitedAt)).toBeGreaterThan(Date.parse(first.body.visitedAt));
  });

  it("deux membres ne se voient pas : une ligne chacun, recent propre à chacun", async () => {
    const world = await createWorld(database);
    await shellApi(app, world.actors.dev).visit(world.projectId);
    await shellApi(app, world.actors.owner).visit(world.projectId);
    expect(await rows(world.actors.dev.userId)).toHaveLength(1);
    expect(await rows(world.actors.owner.userId)).toHaveLength(1);
    expect((await shellApi(app, world.actors.designer).recent()).body).toEqual([]);
  });

  it("l'organisation de la ligne est celle de la session", async () => {
    const world = await createWorld(database);
    await shellApi(app, world.actors.dev).visit(world.projectId);
    const [row] = await database.query<{ organization_id: string }>(
      "SELECT organization_id FROM project_visits WHERE user_id = $1",
      [world.actors.dev.userId],
    );
    expect(row?.organization_id).toBe(world.organizationId);
  });

  it("une préférence n'est pas journalisée : aucune ligne d'audit", async () => {
    const world = await createWorld(database);
    const count = async () =>
      (
        await database.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM audit_log WHERE organization_id = $1",
          [world.organizationId],
        )
      )[0]?.n;
    const before = await count();
    await shellApi(app, world.actors.dev).visit(world.projectId);
    expect(await count()).toBe(before);
  });

  it("tout rôle avec accès au projet peut visiter, client lié compris", async () => {
    const world = await createWorld(database);
    for (const role of ["owner", "admin", "dev", "designer", "business", "client"] as const) {
      const res = await shellApi(app, world.actors[role]).visit(world.projectId);
      expect(res.status, `${role} : ${JSON.stringify(res.body)}`).toBe(200);
    }
  });

  it("404 uniforme sans écrire : projet inconnu, autre organisation, client non lié", async () => {
    const world = await createWorld(database, { linkedClient: false });
    const foreign = await createWorld(database);
    const unknown = "99999999-9999-4999-8999-999999999999";
    const attempts = [
      await shellApi(app, world.actors.dev).visit(unknown),
      await shellApi(app, world.actors.dev).visit(foreign.projectId),
      await shellApi(app, world.actors.client).visit(world.projectId),
    ];
    for (const res of attempts) expect(res.status, JSON.stringify(res.body)).toBe(404);
    const shapes = attempts.map((r) => JSON.stringify(stripRequestId(r.body)));
    expect(new Set(shapes).size).toBe(1);
    expect(await rows(world.actors.dev.userId)).toHaveLength(0);
    expect(await rows(world.actors.client.userId)).toHaveLength(0);
  });

  it("sans session : 401", async () => {
    const world = await createWorld(database);
    expect((await shellApi(app, undefined).visit(world.projectId)).status).toBe(401);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("A8 project.recent", () => {
  it("vide sans visite", async () => {
    const world = await createWorld(database);
    const res = await shellApi(app, world.actors.dev).recent();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("du plus récent au plus ancien, avec nom et instant ; revisiter remonte le projet", async () => {
    const world = await createWorld(database);
    const dev = shellApi(app, world.actors.dev);
    const a = await insertProject(database, world.organizationId, "Alpha");
    const b = await insertProject(database, world.organizationId, "Bravo");
    for (const id of [a, b]) {
      await dev.visit(id);
      await pause();
    }
    const res = await dev.recent();
    expect(namesOf(res.body)).toEqual(["Bravo", "Alpha"]);
    expect(Object.keys(res.body[0]).sort()).toEqual([
      "colorKey",
      "id",
      "initials",
      "name",
      "visitedAt",
    ]);
    // TK-93 (2.8.0) : tuile du projet, calculée comme sur la carte (domaine `projectTileOf`).
    expect(res.body.map((row: { initials: string }) => row.initials)).toEqual(["BR", "AL"]);
    expect(res.body[0].colorKey).toBe(projectTileOf(b, "Bravo").colorKey);
    await dev.visit(a);
    expect(namesOf((await dev.recent()).body)).toEqual(["Alpha", "Bravo"]);
  });

  it("au plus 8 projets, les plus récents", async () => {
    const world = await createWorld(database);
    const dev = shellApi(app, world.actors.dev);
    const ids: string[] = [];
    for (let n = 1; n <= 10; n++) {
      const id = await insertProject(
        database,
        world.organizationId,
        `P${String(n).padStart(2, "0")}`,
      );
      ids.push(id);
      await dev.visit(id);
      await pause(5);
    }
    const res = await dev.recent();
    expect(res.body).toHaveLength(8);
    expect(namesOf(res.body)).toEqual(["P10", "P09", "P08", "P07", "P06", "P05", "P04", "P03"]);
  });

  it("jamais un projet inaccessible : lien client retiré, autre organisation", async () => {
    const world = await createWorld(database);
    const second = await insertProject(database, world.organizationId, "Second");
    await linkClient(database, world.organizationId, second, world.actors.client.userId);
    const client = shellApi(app, world.actors.client);
    await client.visit(world.projectId);
    await client.visit(second);
    expect(namesOf((await client.recent()).body).sort()).toEqual(["Projet", "Second"]);

    await database.query(
      "DELETE FROM project_client_access WHERE project_id = $1 AND user_id = $2",
      [second, world.actors.client.userId],
    );
    expect(namesOf((await client.recent()).body)).toEqual(["Projet"]);

    await database.query("DELETE FROM project_client_access WHERE user_id = $1", [
      world.actors.client.userId,
    ]);
    expect((await client.recent()).body).toEqual([]);
    // La ligne de visite survit : seul l'accès décide de ce qui est rendu.
    expect(await rows(world.actors.client.userId)).toHaveLength(2);
  });

  it("une visite d'une autre organisation n'apparaît jamais", async () => {
    const world = await createWorld(database);
    const foreign = await createWorld(database);
    await shellApi(app, foreign.actors.dev).visit(foreign.projectId);
    expect((await shellApi(app, world.actors.dev).recent()).body).toEqual([]);
  });

  it("sans session : 401", async () => {
    expect((await shellApi(app, undefined).recent()).status).toBe(401);
  });
});
