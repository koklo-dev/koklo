import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { count } from "./helpers/organizations.ts";
import {
  apiFor,
  auditRows,
  createWorld,
  seedSprint,
  seedTicket,
  ticketRow,
} from "./helpers/tickets.ts";

/**
 * TK-30 : chaque écriture insère sa ligne audit_log dans la même transaction. Une ligne d'audit
 * qui échoue (trigger de test) doit annuler l'écriture : preuve de l'atomicité sur base réelle.
 */
let database: TestDatabase;
let app: INestApplication;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  await database.query("CREATE TABLE audit_fail (action text PRIMARY KEY)");
  await database.query(`
    CREATE FUNCTION audit_fail_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM audit_fail WHERE action = NEW.action) THEN
        RAISE EXCEPTION 'audit refusé pour le test: %', NEW.action;
      END IF;
      RETURN NEW;
    END $$`);
  await database.query(
    "CREATE TRIGGER audit_fail_trigger BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_fail_guard()",
  );
});

beforeEach(async () => {
  await database.query("DELETE FROM audit_fail");
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

describe("audit des écritures", () => {
  it("chaque procédure d'écriture ajoute exactement une ligne, dans l'ordre, avec acteur et cible", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);

    const sprint = (await dev.createSprint()).body;
    await dev.createSprint();
    const first = (await dev.createTicket({ status: "todo" })).body;
    const second = (await dev.createTicket({ status: "todo" })).body;
    await dev.updateTicket(first.key, { title: "Modifié" });
    await dev.addDependency(second.key, first.key);
    await dev.removeDependency(second.key, first.key);
    await dev.transition(first.key, "in_progress");
    await dev.deleteTicket(second.key);
    await dev.updateSprint(sprint.key, { goal: "Autre" });
    await dev.activateSprint(sprint.key);
    await dev.closeSprint(sprint.key);

    const rows = await auditRows(database, world.organizationId);
    expect(rows.map((r) => r.action)).toEqual([
      "sprint.create",
      "sprint.create",
      "ticket.create",
      "ticket.create",
      "ticket.update",
      "dependency.add",
      "dependency.remove",
      "ticket.transition",
      "ticket.delete",
      "sprint.update",
      "sprint.activate",
      "sprint.close",
    ]);
    for (const row of rows) {
      expect(row.actor_kind).toBe("human");
      expect(row.actor_id).toBe(world.actors.dev.userId);
      expect(row.organization_id).toBe(world.organizationId);
      expect(row.target_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
    expect(rows[0]).toMatchObject({ target_kind: "sprint", target_id: sprint.id, ticket_id: null });
    expect(rows[2]).toMatchObject({
      target_kind: "ticket",
      target_id: first.id,
      ticket_id: first.id,
    });
    expect(rows[5]?.ticket_id).toBe(second.id);
    expect(rows[8]).toMatchObject({ target_kind: "ticket", target_id: second.id });
  });
});

describe("audit des écritures (suite 2)", () => {
  it("les lectures et les écritures refusées n'écrivent rien", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    const ticket = await seedTicket(app, world.actors.dev);
    await seedSprint(app, world.actors.dev);
    const before = await count(database, "audit_log", "organization_id = $1", [
      world.organizationId,
    ]);

    await dev.getTicket(ticket.key);
    await dev.listTickets();
    await dev.getSprint("SP-1");
    await dev.listSprints();
    await dev.listDependencies(ticket.key);
    expect((await dev.transition(ticket.key, "done")).status).toBe(409);
    expect((await dev.closeSprint("SP-1")).status).toBe(409);
    expect((await dev.updateTicket("TK-99", { title: "x" })).status).toBe(404);
    expect((await apiFor(app, world.actors.client).createTicket()).status).toBe(403);

    expect(await count(database, "audit_log", "organization_id = $1", [world.organizationId])).toBe(
      before,
    );
  });

  it("un échec de l'audit annule l'écriture de ticket.create", async () => {
    const world = await createWorld(database);
    await database.query("INSERT INTO audit_fail VALUES ('ticket.create')");
    const response = await apiFor(app, world.actors.dev).createTicket();
    expect(response.status).toBe(500);
    expect(response.body.code).toBe("INTERNAL");
    expect(await count(database, "tickets", "organization_id = $1", [world.organizationId])).toBe(
      0,
    );
    expect(
      await count(database, "ticket_labels", "organization_id = $1", [world.organizationId]),
    ).toBe(0);
  });
});

describe("audit des écritures (suite 3)", () => {
  it("un échec de l'audit annule ticket.update, ticket.transition et ticket.delete", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    const ticket = await seedTicket(app, world.actors.dev, { title: "Avant", labels: ["x"] });
    await database.query(
      "INSERT INTO audit_fail VALUES ('ticket.update'), ('ticket.transition'), ('ticket.delete')",
    );

    expect((await dev.updateTicket(ticket.key, { title: "Après", labels: ["y"] })).status).toBe(
      500,
    );
    expect((await dev.transition(ticket.key, "in_progress")).status).toBe(500);
    expect((await dev.deleteTicket(ticket.key)).status).toBe(500);

    const row = await ticketRow(database, world.organizationId, ticket.key);
    expect(row).toMatchObject({ title: "Avant", status: "todo", deleted_at: null });
    const labels = await database.query<{ label: string }>(
      "SELECT label FROM ticket_labels WHERE ticket_id = $1",
      [ticket.id],
    );
    expect(labels.map((l) => l.label)).toEqual(["x"]);
  });
});

describe("audit des écritures (suite 4)", () => {
  it("un échec de l'audit annule dependency.add, sprint.create et sprint.activate", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    const a = await seedTicket(app, world.actors.dev);
    const b = await seedTicket(app, world.actors.dev);
    const planned = await seedSprint(app, world.actors.dev);
    await database.query(
      "INSERT INTO audit_fail VALUES ('dependency.add'), ('sprint.create'), ('sprint.activate')",
    );

    expect((await dev.addDependency(a.key, b.key)).status).toBe(500);
    expect((await dev.createSprint()).status).toBe(500);
    expect((await dev.activateSprint(planned.key)).status).toBe(500);

    expect(
      await count(database, "ticket_dependencies", "organization_id = $1", [world.organizationId]),
    ).toBe(0);
    expect(await count(database, "sprints", "organization_id = $1", [world.organizationId])).toBe(
      1,
    );
    expect((await dev.getSprint(planned.key)).body.status).toBe("planned");
  });
});
