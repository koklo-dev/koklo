import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { collaborationFor, createAppWithClock, leaseRows, ManualClock } from "./helpers/leases.ts";
import { count } from "./helpers/organizations.ts";
import { auditRows, createWorld, insertProject, seedTicket } from "./helpers/tickets.ts";

/** TK-31 : audit dans la même transaction (targetKind lease / project_state) et isolation. */
let database: TestDatabase;
let app: INestApplication;
const clock = new ManualClock();

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createAppWithClock(database.url, clock);
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

describe("audit des baux et de l'état de projet", () => {
  it("chaque écriture ajoute une ligne : acteur humain, targetKind, targetId serveur, ticketId", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const dev = collaborationFor(app, world.actors.dev);
    const owner = collaborationFor(app, world.actors.owner);

    await dev.acquire(ticket.key);
    await dev.heartbeat(ticket.key);
    await dev.release(ticket.key);
    await owner.getState();
    await owner.updateState(1, { a: 1 });
    await dev.getLease(ticket.key);

    const rows = (await auditRows(database, world.organizationId)).filter(
      (r) => r.action.startsWith("lease.") || r.action.startsWith("project_state."),
    );
    expect(rows.map((r) => [r.action, r.target_kind])).toEqual([
      ["lease.acquire", "lease"],
      ["lease.heartbeat", "lease"],
      ["lease.release", "lease"],
      ["project_state.update", "project_state"],
    ]);
    const [leaseRow] = await leaseRows(database, ticket.id);
    for (const row of rows.slice(0, 3)) {
      expect(row.target_id).toBe(leaseRow?.id);
      expect(row.ticket_id).toBe(ticket.id);
      expect(row.actor_kind).toBe("human");
      expect(row.actor_id).toBe(world.actors.dev.userId);
    }
    const [state] = await database.query<{ id: string }>(
      "SELECT id FROM project_states WHERE project_id = $1",
      [world.projectId],
    );
    expect(rows[3]?.target_id).toBe(state?.id);
    expect(rows[3]?.ticket_id).toBeNull();
    expect(rows[3]?.actor_id).toBe(world.actors.owner.userId);
  });

  it("un refus ne laisse aucun audit (LEASE_HELD, LEASE_NOT_HOLDER, VERSION_CONFLICT)", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    await collaborationFor(app, world.actors.dev).acquire(ticket.key);
    const before = (await auditRows(database, world.organizationId)).length;
    await collaborationFor(app, world.actors.admin).acquire(ticket.key);
    await collaborationFor(app, world.actors.admin).heartbeat(ticket.key);
    await collaborationFor(app, world.actors.admin).release(ticket.key);
    await collaborationFor(app, world.actors.owner).updateState(9, {});
    expect((await auditRows(database, world.organizationId)).length).toBe(before);
  });
});

describe("atomicité : l'audit qui échoue annule l'écriture", () => {
  it("lease.acquire : aucun bail", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    await database.query("INSERT INTO audit_fail VALUES ('lease.acquire')");
    const response = await collaborationFor(app, world.actors.dev).acquire(ticket.key);
    expect(response.status).toBe(500);
    expect(response.body.code).toBe("INTERNAL");
    expect(await leaseRows(database, ticket.id)).toHaveLength(0);
  });

  it("lease.heartbeat : expires_at inchangé", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const dev = collaborationFor(app, world.actors.dev);
    await dev.acquire(ticket.key);
    const [before] = await leaseRows(database, ticket.id);
    clock.advance(60_000);
    await database.query("INSERT INTO audit_fail VALUES ('lease.heartbeat')");
    expect((await dev.heartbeat(ticket.key)).status).toBe(500);
    const [after] = await leaseRows(database, ticket.id);
    expect(after?.expires_at).toEqual(before?.expires_at);
    expect(after?.heartbeat_at).toEqual(before?.heartbeat_at);
  });

  it("lease.release : le bail reste actif", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const dev = collaborationFor(app, world.actors.dev);
    await dev.acquire(ticket.key);
    await database.query("INSERT INTO audit_fail VALUES ('lease.release')");
    expect((await dev.release(ticket.key)).status).toBe(500);
    expect((await leaseRows(database, ticket.id))[0]?.released_at).toBeNull();
  });

  it("project_state.update : version et contenu inchangés", async () => {
    const world = await createWorld(database);
    const owner = collaborationFor(app, world.actors.owner);
    await owner.getState();
    await database.query("INSERT INTO audit_fail VALUES ('project_state.update')");
    expect((await owner.updateState(1, { a: 1 })).status).toBe(500);
    expect((await owner.getState()).body).toEqual({ version: 1, content: {} });
  });
});

describe("isolation", () => {
  it("un utilisateur d'une autre organisation ne voit ni ne touche un bail ; le même ticket key coexiste", async () => {
    const one = await createWorld(database);
    const two = await createWorld(database);
    const ticketOne = await seedTicket(app, one.actors.dev);
    const ticketTwo = await seedTicket(app, two.actors.dev);
    expect(ticketOne.key).toBe(ticketTwo.key);
    await collaborationFor(app, one.actors.dev).acquire(ticketOne.key);
    const b = collaborationFor(app, two.actors.dev);

    expect((await b.getLease(ticketTwo.key)).body).toBeNull();
    expect((await b.heartbeat(ticketTwo.key)).status).toBe(404);
    expect((await b.release(ticketTwo.key)).status).toBe(404);
    expect(
      (await collaborationFor(app, one.actors.dev).getLease(ticketOne.key)).body,
    ).not.toBeNull();
    expect((await b.acquire(ticketTwo.key)).status).toBe(200);
    expect(await count(database, "leases", "organization_id = $1", [one.organizationId])).toBe(1);
  });

  it("l'état de projet est propre à chaque organisation", async () => {
    const one = await createWorld(database);
    const two = await createWorld(database);
    await collaborationFor(app, one.actors.owner).updateState(1, { secret: "A" });
    const other = await collaborationFor(app, two.actors.owner).getState();
    expect(other.body).toEqual({ version: 1, content: {} });
  });

  it("un bail d'un ticket d'un autre projet est introuvable (projet courant imposé)", async () => {
    const world = await createWorld(database);
    const secondProject = await insertProject(
      database,
      world.organizationId,
      "Second",
      "2026-06-01T00:00:00.000Z",
    );
    const { createAppForProject } = await import("./helpers/tickets.ts");
    const appSecond = await createAppForProject(database.url, secondProject);
    try {
      const ticket = await seedTicket(app, world.actors.dev);
      const second = collaborationFor(appSecond, world.actors.dev);
      for (const response of [
        await second.acquire(ticket.key),
        await second.heartbeat(ticket.key),
        await second.release(ticket.key),
        await second.getLease(ticket.key),
      ]) {
        expect(response.status).toBe(404);
      }
      expect(await leaseRows(database, ticket.id)).toHaveLength(0);
    } finally {
      await appSecond.close();
    }
  });
});
