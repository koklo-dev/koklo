import { projectStateSchema } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { auditCount, collaborationFor, createAppWithClock, ManualClock } from "./helpers/leases.ts";
import { count } from "./helpers/organizations.ts";
import { createWorld } from "./helpers/tickets.ts";

/** TK-31 : état de projet, ligne unique créée à la demande, concurrence optimiste (CDC §7.4). */
let database: TestDatabase;
let app: INestApplication;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createAppWithClock(database.url, new ManualClock());
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

describe("projectState.get", () => {
  it("crée la ligne à la demande en version 1 avec un contenu vide, une seule fois", async () => {
    const world = await createWorld(database);
    const owner = collaborationFor(app, world.actors.owner);
    expect(await count(database, "project_states", "project_id = $1", [world.projectId])).toBe(0);

    const first = await owner.getState();

    expect(first.status).toBe(200);
    expect(projectStateSchema.safeParse(first.body).success).toBe(true);
    expect(first.body).toEqual({ version: 1, content: {} });
    expect((await owner.getState()).body).toEqual({ version: 1, content: {} });
    expect(await count(database, "project_states", "project_id = $1", [world.projectId])).toBe(1);
  });

  it("des lectures simultanées sur un projet sans ligne réussissent toutes et ne créent qu'une ligne", async () => {
    const world = await createWorld(database);
    const owner = collaborationFor(app, world.actors.owner);
    const responses = await Promise.all([owner.getState(), owner.getState(), owner.getState()]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await count(database, "project_states", "project_id = $1", [world.projectId])).toBe(1);
  });
});

describe("projectState.update", () => {
  it("avec la bonne version : contenu remplacé, version + 1", async () => {
    const world = await createWorld(database);
    const owner = collaborationFor(app, world.actors.owner);
    const { version } = (await owner.getState()).body;

    const updated = await owner.updateState(version, { mergePolicy: "owner", repos: ["a"] });

    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ version: 2, content: { mergePolicy: "owner", repos: ["a"] } });
    expect((await owner.getState()).body).toEqual(updated.body);
  });

  it("version périmée : VERSION_CONFLICT avec l'état courant, rien n'est écrit", async () => {
    const world = await createWorld(database);
    const owner = collaborationFor(app, world.actors.owner);
    await owner.updateState(1, { a: 1 });

    const stale = await owner.updateState(1, { a: 2 });

    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");
    expect(stale.body.data).toEqual({ expected: 1, current: { version: 2, content: { a: 1 } } });
    expect(await auditCount(database, world.organizationId, "project_state.update")).toBe(1);
  });
});

describe("projectState.update (suite 2)", () => {
  it("update sur un projet sans ligne : expectedVersion 1 crée puis écrit (version 2), autre version en conflit", async () => {
    const world = await createWorld(database);
    const owner = collaborationFor(app, world.actors.owner);
    const conflict = await owner.updateState(5, { a: 1 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.data.current.version).toBe(1);

    const created = await owner.updateState(1, { a: 1 });
    expect(created.body).toEqual({ version: 2, content: { a: 1 } });
  });

  it("deux updates simultanés avec la même version : un 200, un VERSION_CONFLICT portant l'état gagnant", async () => {
    for (let round = 0; round < 5; round++) {
      const world = await createWorld(database);
      const owner = collaborationFor(app, world.actors.owner);
      const admin = collaborationFor(app, world.actors.admin);
      await owner.getState();

      const responses = await Promise.all([
        owner.updateState(1, { writer: "owner" }),
        admin.updateState(1, { writer: "admin" }),
      ]);

      expect(
        responses.map((r) => r.status).sort(),
        JSON.stringify(responses.map((r) => r.body)),
      ).toEqual([200, 409]);
      const winner = responses.find((r) => r.status === 200);
      const loser = responses.find((r) => r.status === 409);
      expect(winner?.body.version).toBe(2);
      expect(loser?.body.code).toBe("VERSION_CONFLICT");
      expect(loser?.body.data).toEqual({ expected: 1, current: winner?.body });
      expect(await auditCount(database, world.organizationId, "project_state.update")).toBe(1);
    }
  });

  it("entrées invalides : version < 1 ou contenu non objet", async () => {
    const world = await createWorld(database);
    const owner = collaborationFor(app, world.actors.owner);
    for (const response of [
      await owner.updateState(0, {}),
      await owner.updateState(1, "texte" as unknown as Record<string, unknown>),
      await owner.updateState(1, [] as unknown as Record<string, unknown>),
    ]) {
      expect([400, 422]).toContain(response.status);
    }
  });
});
