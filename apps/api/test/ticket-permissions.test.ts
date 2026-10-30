import type { Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { count, ROLES } from "./helpers/organizations.ts";
import {
  apiFor,
  createWorld,
  seedSprint,
  seedTicket,
  ticketRow,
  type World,
} from "./helpers/tickets.ts";

/** TK-30 : matrice de rôles (CDC §14), rôle relu en base, 401 sans session. */
let database: TestDatabase;
let app: INestApplication;
let world: World;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  world = await createWorld(database);
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

type Api = ReturnType<typeof apiFor>;
interface Procedure {
  name: string;
  write: boolean;
  /** Prépare une cible neuve (créée par un dev) puis exécute la procédure avec `api`. */
  run: (api: Api) => Promise<Response>;
}

const dev = () => world.actors.dev;
const freshTicket = async (status = "todo") => (await seedTicket(app, dev(), { status })).key;
const freshSprint = async () => (await seedSprint(app, dev())).key;

const procedures: Procedure[] = [
  { name: "ticket.get", write: false, run: async (api) => api.getTicket(await freshTicket()) },
  { name: "ticket.list", write: false, run: async (api) => api.listTickets() },
  {
    name: "dependency.list",
    write: false,
    run: async (api) => api.listDependencies(await freshTicket()),
  },
  { name: "sprint.get", write: false, run: async (api) => api.getSprint(await freshSprint()) },
  { name: "sprint.list", write: false, run: async (api) => api.listSprints() },
  { name: "ticket.create", write: true, run: async (api) => api.createTicket() },
  {
    name: "ticket.update",
    write: true,
    run: async (api) => api.updateTicket(await freshTicket(), { title: "Modifié" }),
  },
  { name: "ticket.delete", write: true, run: async (api) => api.deleteTicket(await freshTicket()) },
  {
    name: "ticket.transition",
    write: true,
    run: async (api) => api.transition(await freshTicket(), "in_progress"),
  },
  {
    name: "dependency.add",
    write: true,
    run: async (api) => api.addDependency(await freshTicket(), await freshTicket()),
  },
  {
    name: "dependency.remove",
    write: true,
    run: async (api) => {
      const [a, b] = [await freshTicket(), await freshTicket()];
      await apiFor(app, dev()).addDependency(a, b);
      return api.removeDependency(a, b);
    },
  },
  { name: "sprint.create", write: true, run: async (api) => api.createSprint() },
  {
    name: "sprint.update",
    write: true,
    run: async (api) => api.updateSprint(await freshSprint(), { goal: "Autre" }),
  },
  {
    name: "sprint.activate",
    write: true,
    run: async (api) => {
      const key = await freshSprint();
      // Libère la place : un seul sprint actif par projet, d'autres tests ont pu en activer un.
      await database.query(
        "UPDATE sprints SET status = 'closed' WHERE project_id = $1 AND status = 'active'",
        [world.projectId],
      );
      return api.activateSprint(key);
    },
  },
  {
    name: "sprint.close",
    write: true,
    run: async (api) => {
      await database.query(
        "UPDATE sprints SET status = 'closed' WHERE project_id = $1 AND status = 'active'",
        [world.projectId],
      );
      const key = await freshSprint();
      expect((await apiFor(app, dev()).activateSprint(key)).status).toBe(200);
      return api.closeSprint(key);
    },
  },
];

const WRITERS: readonly Role[] = ["owner", "admin", "dev", "designer"];

describe("matrice de rôles", () => {
  for (const procedure of procedures) {
    for (const role of ROLES) {
      const allowed = !procedure.write || WRITERS.includes(role);
      it(`${procedure.name} : ${role} -> ${allowed ? "autorisé" : "403 FORBIDDEN"}`, async () => {
        const result = await procedure.run(apiFor(app, world.actors[role]));
        if (allowed) {
          expect(result.status).toBe(200);
        } else {
          expect(result.status).toBe(403);
          expect(result.body.code).toBe("FORBIDDEN");
        }
      });
    }
  }
});

describe("écriture refusée : aucune écriture, aucun audit", () => {
  it("client et business ne créent ni ticket ni sprint et ne laissent aucune trace", async () => {
    const isolated = await createWorld(database);
    const before = {
      tickets: await count(database, "tickets", "organization_id = $1", [isolated.organizationId]),
      sprints: await count(database, "sprints", "organization_id = $1", [isolated.organizationId]),
      audit: await count(database, "audit_log", "organization_id = $1", [isolated.organizationId]),
    };
    for (const role of ["client", "business"] as const) {
      const api = apiFor(app, isolated.actors[role]);
      expect((await api.createTicket()).status).toBe(403);
      expect((await api.createSprint()).status).toBe(403);
    }
    expect(
      await count(database, "tickets", "organization_id = $1", [isolated.organizationId]),
    ).toBe(before.tickets);
    expect(
      await count(database, "sprints", "organization_id = $1", [isolated.organizationId]),
    ).toBe(before.sprints);
    expect(
      await count(database, "audit_log", "organization_id = $1", [isolated.organizationId]),
    ).toBe(before.audit);
  });

  it("un client ne peut ni supprimer ni transitionner un ticket existant", async () => {
    const isolated = await createWorld(database);
    const ticket = await seedTicket(app, isolated.actors.dev, { status: "todo" });
    const client = apiFor(app, isolated.actors.client);
    expect((await client.deleteTicket(ticket.key)).status).toBe(403);
    expect((await client.transition(ticket.key, "in_progress")).status).toBe(403);
    const row = await ticketRow(database, isolated.organizationId, ticket.key);
    expect(row?.status).toBe("todo");
    expect(row?.deleted_at).toBeNull();
  });
});

describe("rôle relu en base à chaque requête", () => {
  it("un dev rétrogradé en client perd aussitôt l'écriture, sans nouvelle session", async () => {
    const isolated = await createWorld(database);
    const api = apiFor(app, isolated.actors.dev);
    expect((await api.createTicket()).status).toBe(200);
    await database.query("UPDATE members SET role = 'client' WHERE id = $1", [
      isolated.actors.dev.memberId,
    ]);
    const denied = await api.createTicket();
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("FORBIDDEN");
    expect((await api.listTickets()).status).toBe(200);
  });
});

describe("sans session : 401 UNAUTHORIZED", () => {
  for (const procedure of procedures) {
    it(`${procedure.name} sans cookie -> 401`, async () => {
      const result = await procedure.run(apiFor(app, undefined));
      expect(result.status).toBe(401);
      expect(result.body.code).toBe("UNAUTHORIZED");
    });
  }
});
