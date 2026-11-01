import { ticketDetailSchema, ticketSchema } from "@koklo/contract";
import { SEED_IDS } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase, UNREACHABLE_DATABASE_URL } from "./helpers/app.ts";
import { count } from "./helpers/organizations.ts";
import {
  apiFor,
  createWorld,
  insertLease,
  insertProject,
  seedSprint,
  seedTicket,
  send,
  ticketRow,
} from "./helpers/tickets.ts";

/** TK-30 : CRUD des tickets, suppression logique, clés TK-n par compteur, masquage du bail. */
let database: TestDatabase;
let app: INestApplication;
const extraApps: INestApplication[] = [];

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
});

afterAll(async () => {
  await Promise.all([app, ...extraApps].map((a) => a?.close()));
  await database?.dispose();
});

describe("ticket.create", () => {
  it("crée un ticket backlog par défaut, conforme à ticketSchema, clé TK-1", async () => {
    const world = await createWorld(database);
    const response = await apiFor(app, world.actors.dev).createTicket({
      title: "Écrire le contrat",
      description: "Détails",
      labels: ["front", "urgent"],
      linkedFeatures: ["F-12"],
      estimateHours: 3.5,
      criteria: [{ statement: "Le test passe", specRef: "§7.2" }],
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      key: "TK-1",
      title: "Écrire le contrat",
      description: "Détails",
      type: "task",
      status: "backlog",
      priority: "medium",
      sprint: null,
      assignee: null,
      pkg: "api",
      sensitivity: "safe",
      estimateHours: 3.5,
      linkedFeatures: ["F-12"],
      branch: null,
      pullRequest: null,
      attempts: 0,
      reviewRounds: 0,
    });
    expect([...response.body.labels].sort()).toEqual(["front", "urgent"]);
    expect(ticketSchema.safeParse(response.body).success).toBe(true);
  });
});

describe("ticket.create (suite 2)", () => {
  it("accepte status todo à la création, refuse les autres statuts", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    expect((await dev.createTicket({ status: "todo" })).body.status).toBe("todo");
    const refused = await dev.createTicket({ status: "in_progress" });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.status).toBeLessThan(500);
    expect(await count(database, "tickets", "organization_id = $1", [world.organizationId])).toBe(
      1,
    );
  });

  it("stocke l'assignee en assigneeKind/assigneeId et le restitue en chaîne", async () => {
    const world = await createWorld(database);
    const created = await apiFor(app, world.actors.dev).createTicket({
      assignee: { kind: "member", id: "membre-42" },
    });
    expect(created.status).toBe(200);
    expect(typeof created.body.assignee).toBe("string");
    expect(created.body.assignee).toContain("membre-42");
    const row = await ticketRow(database, world.organizationId, "TK-1");
    expect(row?.assignee_kind).toBe("member");
    expect(row?.assignee_id).toBe("membre-42");
  });

  it("rejette un label pkg:* (VALIDATION) sans écrire de ticket", async () => {
    const world = await createWorld(database);
    const response = await apiFor(app, world.actors.dev).createTicket({ labels: ["pkg:web"] });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe("VALIDATION");
    expect(response.body.data.field).toBe("labels");
    expect(await count(database, "tickets", "organization_id = $1", [world.organizationId])).toBe(
      0,
    );
  });
});

describe("ticket.create (suite 3)", () => {
  it("rejette un sprintId inconnu avec VALIDATION sur sprintId", async () => {
    const world = await createWorld(database);
    const response = await apiFor(app, world.actors.dev).createTicket({ sprintId: "SP-9" });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe("VALIDATION");
    expect(response.body.data.field).toBe("sprintId");
  });

  it("rattache le ticket au sprint demandé", async () => {
    const world = await createWorld(database);
    const sprint = await seedSprint(app, world.actors.dev);
    const created = await apiFor(app, world.actors.dev).createTicket({ sprintId: sprint.key });
    expect(created.body.sprint).toBe(sprint.key);
  });
});

describe("clés TK-n attribuées par le compteur du projet", () => {
  it("dix créations concurrentes produisent dix clés distinctes", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    const responses = await Promise.all(Array.from({ length: 10 }, () => dev.createTicket()));
    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
    const keys = responses.map((r) => r.body.key as string);
    expect(new Set(keys).size).toBe(10);
    expect(keys.sort()).toEqual(Array.from({ length: 10 }, (_, i) => `TK-${i + 1}`).sort());
  });

  it("repart du compteur en base (41 -> TK-42), propre à chaque projet", async () => {
    const world = await createWorld(database);
    await database.query(
      `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
       VALUES ($1, $2, 'ticket', 41, now(), now())`,
      [world.organizationId, world.projectId],
    );
    const dev = apiFor(app, world.actors.dev);
    expect((await dev.createTicket()).body.key).toBe("TK-42");
    const other = await createWorld(database);
    expect((await apiFor(app, other.actors.dev).createTicket()).body.key).toBe("TK-1");
  });

  it("la clé d'un ticket supprimé n'est jamais réutilisée", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await dev.createTicket();
    await dev.createTicket();
    expect((await dev.deleteTicket("TK-2")).status).toBe(200);
    expect((await dev.createTicket()).body.key).toBe("TK-3");
  });
});

describe("ticket.get et ticket.list", () => {
  it("get renvoie un ticketDetail avec critères, dépendances et lease null", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await dev.createTicket({ criteria: [{ statement: "A", specRef: "§1" }, { statement: "B" }] });
    await dev.createTicket();
    await dev.addDependency("TK-1", "TK-2", "blocks");
    const response = await dev.getTicket("TK-1");
    expect(response.status).toBe(200);
    expect(ticketDetailSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.criteria).toEqual([
      { statement: "A", specRef: "§1" },
      { statement: "B", specRef: null },
    ]);
    expect(response.body.dependencies).toEqual([
      { ticket: "TK-1", dependsOn: "TK-2", type: "blocks" },
    ]);
    expect(response.body.lease).toBeNull();
  });

  it("get d'une clé inconnue est NOT_FOUND", async () => {
    const world = await createWorld(database);
    const response = await apiFor(app, world.actors.dev).getTicket("TK-77");
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
  });
});

describe("ticket.get et ticket.list (suite 2)", () => {
  it("list pagine par curseur stable (createdAt,id), limite par défaut et filtres", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    const sprint = await seedSprint(app, world.actors.dev);
    for (let i = 0; i < 5; i++) {
      await dev.createTicket({
        status: i % 2 === 0 ? "todo" : "backlog",
        sprintId: i < 2 ? sprint.key : undefined,
        pkg: i === 4 ? "web" : "api",
      });
    }
    const page1 = await dev.listTickets("?limit=2");
    expect(page1.status).toBe(200);
    expect(page1.body.items.map((t: { key: string }) => t.key)).toEqual(["TK-1", "TK-2"]);
    expect(typeof page1.body.nextCursor).toBe("string");
    const page2 = await dev.listTickets(
      `?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`,
    );
    expect(page2.body.items.map((t: { key: string }) => t.key)).toEqual(["TK-3", "TK-4"]);
    const page3 = await dev.listTickets(
      `?limit=2&cursor=${encodeURIComponent(page2.body.nextCursor)}`,
    );
    expect(page3.body.items.map((t: { key: string }) => t.key)).toEqual(["TK-5"]);
    expect(page3.body.nextCursor).toBeNull();

    const todo = await dev.listTickets("?status=todo");
    expect(todo.body.items.map((t: { key: string }) => t.key)).toEqual(["TK-1", "TK-3", "TK-5"]);
    const inSprint = await dev.listTickets(`?sprintId=${sprint.key}`);
    expect(inSprint.body.items.map((t: { key: string }) => t.key)).toEqual(["TK-1", "TK-2"]);
    const web = await dev.listTickets("?pkg=web");
    expect(web.body.items.map((t: { key: string }) => t.key)).toEqual(["TK-5"]);
  });
});

describe("ticket.update", () => {
  it("modifie les champs fournis, remplace les listes fournies, laisse le reste", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await dev.createTicket({ title: "Avant", labels: ["a", "b"], linkedFeatures: ["F-1"] });
    const updated = await dev.updateTicket("TK-1", {
      title: "Après",
      priority: "high",
      labels: ["c"],
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      key: "TK-1",
      title: "Après",
      priority: "high",
      labels: ["c"],
      linkedFeatures: ["F-1"],
      status: "backlog",
    });
    expect(ticketSchema.safeParse(updated.body).success).toBe(true);
  });

  it("ne modifie jamais le statut (schéma strict)", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await dev.createTicket();
    const response = await dev.updateTicket("TK-1", { status: "done" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect((await ticketRow(database, world.organizationId, "TK-1"))?.status).toBe("backlog");
  });
});

describe("ticket.update (suite 2)", () => {
  it("rejette un label pkg:* et un sprintId inconnu en VALIDATION", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await dev.createTicket();
    const label = await dev.updateTicket("TK-1", { labels: ["pkg:db"] });
    expect(label.status).toBe(422);
    expect(label.body.data.field).toBe("labels");
    const sprint = await dev.updateTicket("TK-1", { sprintId: "SP-5" });
    expect(sprint.status).toBe(422);
    expect(sprint.body.data.field).toBe("sprintId");
  });

  it("une clé inconnue est NOT_FOUND", async () => {
    const world = await createWorld(database);
    const response = await apiFor(app, world.actors.dev).updateTicket("TK-9", { title: "x" });
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
  });
});

describe("ticket.delete : suppression logique", () => {
  it("pose deleted_at, garde la ligne, et le ticket disparaît partout", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    await dev.createTicket({ status: "todo" });
    await dev.createTicket();

    const deleted = await dev.deleteTicket("TK-1");
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ key: "TK-1" });

    const row = await ticketRow(database, world.organizationId, "TK-1");
    expect(row?.deleted_at).not.toBeNull();
    expect((await dev.getTicket("TK-1")).status).toBe(404);
    expect((await dev.updateTicket("TK-1", { title: "x" })).status).toBe(404);
    expect((await dev.transition("TK-1", "in_progress")).status).toBe(404);
    expect((await dev.listDependencies("TK-1")).status).toBe(404);
    expect((await dev.deleteTicket("TK-1")).status).toBe(404);
    const listed = await dev.listTickets();
    expect(listed.body.items.map((t: { key: string }) => t.key)).toEqual(["TK-2"]);
  });

  it("refuse la suppression avec un bail non libéré (ticket_has_active_lease)", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    const ticket = await seedTicket(app, world.actors.dev);
    await insertLease(database, world.organizationId, ticket.id);

    const refused = await dev.deleteTicket(ticket.key);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CONFLICT");
    expect(refused.body.data).toEqual({ reason: "ticket_has_active_lease" });
    expect((await ticketRow(database, world.organizationId, ticket.key))?.deleted_at).toBeNull();
  });

  it("autorise la suppression quand le bail est libéré", async () => {
    const world = await createWorld(database);
    const dev = apiFor(app, world.actors.dev);
    const ticket = await seedTicket(app, world.actors.dev);
    await insertLease(database, world.organizationId, ticket.id, { released: true });
    expect((await dev.deleteTicket(ticket.key)).status).toBe(200);
  });
});

describe("ticket.get : masquage de lease.worktree", () => {
  it("expose le worktree à owner, admin, dev, designer ; le masque pour client et business", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    await insertLease(database, world.organizationId, ticket.id, {
      worktree: "/srv/worktrees/secret-tree",
    });

    for (const role of ["owner", "admin", "dev", "designer"] as const) {
      const response = await apiFor(app, world.actors[role]).getTicket(ticket.key);
      expect(response.status).toBe(200);
      expect(ticketDetailSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.lease.worktree).toBe("/srv/worktrees/secret-tree");
    }
    for (const role of ["client", "business"] as const) {
      const response = await apiFor(app, world.actors[role]).getTicket(ticket.key);
      expect(response.status).toBe(200);
      expect(ticketDetailSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.lease).toMatchObject({
        ticket: ticket.key,
        branch: "feat/tk-x",
        holder: { kind: "runner", id: "runner-1" },
        released: false,
      });
      expect(response.body.lease.worktree).toBe("");
      expect(JSON.stringify(response.body)).not.toContain("secret-tree");
    }
  });
});

describe("erreurs inattendues et contexte de projet", () => {
  it("base injoignable : 500 INTERNAL avec requestId, sans détail interne", async () => {
    const unreachable = await createApp({
      databaseUrl: UNREACHABLE_DATABASE_URL,
      organizationId: SEED_IDS.organization,
      role: "owner",
    });
    extraApps.push(unreachable);
    const response = await send(unreachable, undefined, "get", "/tickets");
    expect(response.status).toBe(500);
    expect(response.body.code).toBe("INTERNAL");
    expect(response.body.data.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toMatch(
      /secret-pw|127\.0\.0\.1|ECONNREFUSED|prisma/i,
    );
  });

  it("projet courant v1 : le plus ancien projet de l'organisation (H2)", async () => {
    const world = await createWorld(database);
    await insertProject(database, world.organizationId, "Plus récent", "2026-06-01T00:00:00.000Z");
    const created = await apiFor(app, world.actors.dev).createTicket();
    expect(created.status).toBe(200);
    const rows = await database.query<{ project_id: string }>(
      "SELECT project_id FROM tickets WHERE organization_id = $1",
      [world.organizationId],
    );
    expect(rows).toEqual([{ project_id: world.projectId }]);
  });

  it("une organisation sans projet : lecture NOT_FOUND, création sans écriture", async () => {
    const world = await createWorld(database);
    await database.query("DELETE FROM projects WHERE id = $1", [world.projectId]);
    const dev = apiFor(app, world.actors.dev);
    const read = await dev.getTicket("TK-1");
    expect(read.status).toBe(404);
    expect(read.body.code).toBe("NOT_FOUND");
    const created = await dev.createTicket();
    expect(created.status).toBe(404);
    expect(created.body.code).toBe("NOT_FOUND");
    expect(await count(database, "tickets", "organization_id = $1", [world.organizationId])).toBe(
      0,
    );
  });
});
