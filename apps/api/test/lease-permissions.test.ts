import type { Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { auditCount, collaborationFor, createAppWithClock, ManualClock } from "./helpers/leases.ts";
import { count } from "./helpers/organizations.ts";
import { createWorld, seedTicket } from "./helpers/tickets.ts";

/** TK-31 : matrice de rôles des baux et de l'état de projet (CDC §14), rôle relu en base. */
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

const ACQUIRE_ALLOWED: Role[] = ["owner", "admin", "dev"];
const ACQUIRE_DENIED: Role[] = ["designer", "client", "business"];

describe("lease.acquire", () => {
  it.each(ACQUIRE_ALLOWED)("%s peut prendre un bail", async (role) => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const response = await collaborationFor(app, world.actors[role]).acquire(ticket.key);
    expect(response.status).toBe(200);
    expect(response.body.holder).toEqual({ kind: "member", id: world.actors[role].userId });
  });

  it.each(ACQUIRE_DENIED)("%s reçoit FORBIDDEN, sans bail ni audit", async (role) => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    const response = await collaborationFor(app, world.actors[role]).acquire(ticket.key);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
    expect(await count(database, "leases", "organization_id = $1", [world.organizationId])).toBe(0);
    expect(await auditCount(database, world.organizationId, "lease.acquire")).toBe(0);
  });

  it.each(["client", "business"] as const)("%s ne peut ni battre ni libérer", async (role) => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    await collaborationFor(app, world.actors.dev).acquire(ticket.key);
    const api = collaborationFor(app, world.actors[role]);
    expect((await api.heartbeat(ticket.key)).status).toBe(403);
    expect((await api.release(ticket.key)).status).toBe(403);
  });
});

describe("lease.get : worktree masqué hors rôles d'écriture", () => {
  it("tous les rôles lisent le bail ; client et business reçoivent worktree vide", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    await collaborationFor(app, world.actors.dev).acquire(ticket.key, {
      worktree: "/srv/worktrees/secret-tree",
    });
    for (const role of ["owner", "admin", "dev", "designer"] as const) {
      const response = await collaborationFor(app, world.actors[role]).getLease(ticket.key);
      expect(response.status).toBe(200);
      expect(response.body.worktree).toBe("/srv/worktrees/secret-tree");
    }
    for (const role of ["client", "business"] as const) {
      const response = await collaborationFor(app, world.actors[role]).getLease(ticket.key);
      expect(response.status).toBe(200);
      expect(response.body.worktree).toBe("");
      expect(response.body.branch).toBe("feat/tk-x");
      expect(JSON.stringify(response.body)).not.toContain("secret-tree");
    }
  });
});

describe("projectState", () => {
  it.each(["owner", "admin", "dev"] as const)("%s lit l'état de projet", async (role) => {
    const world = await createWorld(database);
    const response = await collaborationFor(app, world.actors[role]).getState();
    expect(response.status).toBe(200);
  });

  it.each(["designer", "client", "business"] as const)(
    "%s ne lit pas l'état (FORBIDDEN)",
    async (role) => {
      const world = await createWorld(database);
      const response = await collaborationFor(app, world.actors[role]).getState();
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
    },
  );

  it.each(["owner", "admin"] as const)("%s écrit l'état", async (role) => {
    const world = await createWorld(database);
    const api = collaborationFor(app, world.actors[role]);
    const current = (await api.getState()).body;
    const response = await api.updateState(current.version, { mergePolicy: "owner" });
    expect(response.status).toBe(200);
  });

  it.each(["dev", "designer", "client", "business"] as const)(
    "%s ne peut pas écrire l'état : FORBIDDEN, aucune écriture, aucun audit",
    async (role) => {
      const world = await createWorld(database);
      const owner = collaborationFor(app, world.actors.owner);
      const before = (await owner.getState()).body;
      const response = await collaborationFor(app, world.actors[role]).updateState(before.version, {
        pirate: true,
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
      expect((await owner.getState()).body).toEqual(before);
      expect(await auditCount(database, world.organizationId, "project_state.update")).toBe(0);
    },
  );
});
