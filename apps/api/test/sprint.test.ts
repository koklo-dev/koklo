import { sprintSchema } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { count } from "./helpers/organizations.ts";
import { apiFor, createWorld, seedSprint, seedTicket } from "./helpers/tickets.ts";

/** TK-30 : sprints (CDC §7.3) : clés SP-n, un seul sprint actif par projet, cycle de vie. */
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

describe("sprint.create / get / list / update", () => {
  it("crée SP-1 puis SP-2 en planned, conformes à sprintSchema, definitionOfDone vide par défaut", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    const first = await dev.createSprint({ goal: "Premier" });
    const second = await dev.createSprint({ goal: "Second", definitionOfDone: "Tout est vert" });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      key: "SP-1",
      goal: "Premier",
      status: "planned",
      startsOn: "2026-11-02",
      endsOn: "2026-11-13",
      definitionOfDone: "",
    });
    expect(second.body).toMatchObject({ key: "SP-2", definitionOfDone: "Tout est vert" });
    expect(sprintSchema.safeParse(first.body).success).toBe(true);
  });

  it("refuse des dates incohérentes sans rien écrire", async () => {
    const world = await createWorld(database);
    const response = await apiFor(app, world.actors.dev).createSprint({
      startsOn: "2026-11-13",
      endsOn: "2026-11-02",
    });
    expect([400, 422]).toContain(response.status);
    expect(await count(database, "sprints", "organization_id = $1", [world.organizationId])).toBe(
      0,
    );
  });
});

describe("sprint.create / get / list / update (suite 2)", () => {
  it("get, list et filtre par statut ; clé inconnue NOT_FOUND", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    await dev.activateSprint("SP-2");

    expect((await dev.getSprint("SP-1")).body).toMatchObject({ key: "SP-1", status: "planned" });
    const all = await dev.listSprints();
    expect(all.status).toBe(200);
    expect(all.body.map((s: { key: string }) => s.key)).toEqual(["SP-1", "SP-2"]);
    const active = await dev.listSprints("?status=active");
    expect(active.body.map((s: { key: string }) => s.key)).toEqual(["SP-2"]);

    const unknown = await dev.getSprint("SP-99");
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("NOT_FOUND");
  });

  it("update modifie les champs fournis, jamais le statut", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    const updated = await dev.updateSprint("SP-1", { goal: "Nouveau but" });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ key: "SP-1", goal: "Nouveau but", status: "planned" });
    expect((await dev.getSprint("SP-1")).body.endsOn).toBe("2026-11-13");

    const sneaky = await dev.updateSprint("SP-1", { status: "active" });
    expect(sneaky.status).toBeGreaterThanOrEqual(400);
    expect(sneaky.status).toBeLessThan(500);
    expect((await dev.getSprint("SP-1")).body.status).toBe("planned");

    expect((await dev.updateSprint("SP-42", { goal: "x" })).status).toBe(404);
  });
});

describe("un seul sprint actif par projet", () => {
  it("refuse un second sprint actif avec CONFLICT sprint_already_active", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    expect((await dev.activateSprint("SP-1")).status).toBe(200);

    const second = await dev.activateSprint("SP-2");
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("CONFLICT");
    expect(second.body.data).toEqual({ reason: "sprint_already_active" });
    expect((await dev.getSprint("SP-2")).body.status).toBe("planned");
    expect(
      await count(database, "sprints", "organization_id = $1 AND status = 'active'", [
        world.organizationId,
      ]),
    ).toBe(1);
  });

  it("deux activations concurrentes : une seule réussit, l'autre est un CONFLICT (jamais INTERNAL)", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);

    const [a, b] = await Promise.all([dev.activateSprint("SP-1"), dev.activateSprint("SP-2")]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe("CONFLICT");
    expect(loser.body.data.reason).toBe("sprint_already_active");
    expect(
      await count(database, "sprints", "organization_id = $1 AND status = 'active'", [
        world.organizationId,
      ]),
    ).toBe(1);
  });
});

describe("un seul sprint actif par projet (suite 2)", () => {
  it("un sprint actif d'une autre organisation ne bloque pas l'activation", async () => {
    const one = await createWorld(database);
    const two = await createWorld(database);
    await seedSprint(app, one.actors.dev);
    await seedSprint(app, two.actors.dev);
    expect((await apiFor(app, one.actors.dev).activateSprint("SP-1")).status).toBe(200);
    expect((await apiFor(app, two.actors.dev).activateSprint("SP-1")).status).toBe(200);
  });

  it("un sprint clos libère la place pour un autre", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    await dev.activateSprint("SP-1");
    expect((await dev.closeSprint("SP-1")).body).toMatchObject({ key: "SP-1", status: "closed" });
    expect((await dev.activateSprint("SP-2")).status).toBe(200);
  });
});

describe("cycle de vie : planned -> active -> closed, sans réouverture", () => {
  it("activate exige planned, close exige active", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);

    const earlyClose = await dev.closeSprint("SP-1");
    expect(earlyClose.status).toBe(409);
    expect(earlyClose.body.data).toEqual({ reason: "sprint_not_active" });

    expect((await dev.activateSprint("SP-1")).status).toBe(200);
    const reactivate = await dev.activateSprint("SP-1");
    expect(reactivate.status).toBe(409);
    expect(reactivate.body.data).toEqual({ reason: "sprint_not_planned" });

    expect((await dev.closeSprint("SP-1")).status).toBe(200);
    const reopen = await dev.activateSprint("SP-1");
    expect(reopen.status).toBe(409);
    expect(reopen.body.data).toEqual({ reason: "sprint_not_planned" });
    const closeTwice = await dev.closeSprint("SP-1");
    expect(closeTwice.status).toBe(409);
    expect(closeTwice.body.data).toEqual({ reason: "sprint_not_active" });
  });
});

describe("cycle de vie : planned -> active -> closed, sans réouverture (suite 2)", () => {
  it("un sprint closed n'accepte plus de ticket (create et update), planned et active oui", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    await dev.activateSprint("SP-2");
    await dev.closeSprint("SP-2");

    expect((await dev.createTicket({ sprintId: "SP-1" })).status).toBe(200);
    expect((await dev.createTicket({ sprintId: "SP-3" })).status).toBe(200);
    await dev.activateSprint("SP-3");
    expect((await dev.createTicket({ sprintId: "SP-3" })).status).toBe(200);

    const refused = await dev.createTicket({ sprintId: "SP-2" });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe("VALIDATION");
    expect(refused.body.data.field).toBe("sprintId");

    const ticket = await seedTicket(app, world.actors.dev);
    const moved = await dev.updateTicket(ticket.key, { sprintId: "SP-2" });
    expect(moved.status).toBe(422);
    expect(moved.body.data.field).toBe("sprintId");
  });
});
