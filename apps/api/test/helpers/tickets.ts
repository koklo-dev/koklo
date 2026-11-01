import { randomUUID } from "node:crypto";
import type { Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module.ts";
import { configFor } from "./app.ts";
import { type Actor, insertActor, insertOrganization, ROLES } from "./organizations.ts";

/**
 * Monde de test des tickets : une organisation, un projet (le plus ancien : celui que résout le
 * contexte v1, H2) et un utilisateur par rôle, chacun avec une session Better Auth réelle.
 */
export interface World {
  organizationId: string;
  projectId: string;
  actors: Record<Role, Actor>;
}

export async function insertProject(
  database: TestDatabase,
  organizationId: string,
  name = "Projet",
  createdAt = "2026-01-01T00:00:00.000Z",
): Promise<string> {
  const id = randomUUID();
  await database.query(
    "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)",
    [id, organizationId, name, createdAt],
  );
  return id;
}

let worlds = 0;

export async function createWorld(database: TestDatabase): Promise<World> {
  const organizationId = await insertOrganization(database, `tk30-${Date.now()}-${++worlds}`);
  const projectId = await insertProject(database, organizationId);
  const actors = {} as Record<Role, Actor>;
  for (const role of ROLES) {
    actors[role] = await insertActor(database, organizationId, role);
  }
  return { organizationId, projectId, actors };
}

export type HttpMethod = "get" | "post" | "patch" | "put" | "delete";

export function send(
  app: INestApplication,
  cookie: string | undefined,
  method: HttpMethod,
  path: string,
  body?: Record<string, unknown>,
) {
  const req = request(app.getHttpServer())[method](path);
  if (cookie) {
    req.set("Cookie", cookie);
  }
  return body === undefined ? req : req.send(body);
}

export const TICKET_DEFAULTS = {
  title: "Un ticket",
  type: "task",
  priority: "medium",
  pkg: "api",
  sensitivity: "safe",
} as const;

export const SPRINT_DEFAULTS = {
  goal: "Un objectif",
  startsOn: "2026-11-02",
  endsOn: "2026-11-13",
} as const;

/** Client de l'API pour un acteur ; les appels sont ceux du contrat 0.4.0 (HTTP réel). */
export function apiFor(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    createTicket: (over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", "/tickets", { ...TICKET_DEFAULTS, ...over }),
    getTicket: (key: string) => send(app, cookie, "get", `/tickets/${key}`),
    listTickets: (query = "") => send(app, cookie, "get", `/tickets${query}`),
    updateTicket: (key: string, over: Record<string, unknown>) =>
      send(app, cookie, "patch", `/tickets/${key}`, { key, ...over }),
    deleteTicket: (key: string) => send(app, cookie, "delete", `/tickets/${key}`),
    transition: (key: string, to: string) =>
      send(app, cookie, "post", `/tickets/${key}/transition`, { key, to }),
    addDependency: (key: string, dependsOn: string, type = "blocks") =>
      send(app, cookie, "post", `/tickets/${key}/dependencies`, { key, dependsOn, type }),
    removeDependency: (key: string, dependsOn: string, type = "blocks") =>
      send(app, cookie, "delete", `/tickets/${key}/dependencies/${dependsOn}`, { type }),
    listDependencies: (key: string) => send(app, cookie, "get", `/tickets/${key}/dependencies`),
    createSprint: (over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", "/sprints", { ...SPRINT_DEFAULTS, ...over }),
    getSprint: (key: string) => send(app, cookie, "get", `/sprints/${key}`),
    listSprints: (query = "") => send(app, cookie, "get", `/sprints${query}`),
    updateSprint: (key: string, over: Record<string, unknown>) =>
      send(app, cookie, "patch", `/sprints/${key}`, { key, ...over }),
    activateSprint: (key: string) => send(app, cookie, "post", `/sprints/${key}/activate`, { key }),
    closeSprint: (key: string) => send(app, cookie, "post", `/sprints/${key}/close`, { key }),
  };
}

/** Crée un ticket par l'API et exige un succès : renvoie le corps (ticketSchema). */
export async function seedTicket(
  app: INestApplication,
  actor: Actor,
  over: Record<string, unknown> = {},
): Promise<{ key: string; id: string } & Record<string, unknown>> {
  const response = await apiFor(app, actor).createTicket({ status: "todo", ...over });
  if (response.status !== 200) {
    throw new Error(
      `ticket.create a répondu ${response.status} : ${JSON.stringify(response.body)}`,
    );
  }
  return response.body;
}

export async function seedSprint(
  app: INestApplication,
  actor: Actor,
  over: Record<string, unknown> = {},
): Promise<{ key: string; id: string } & Record<string, unknown>> {
  const response = await apiFor(app, actor).createSprint(over);
  if (response.status !== 200) {
    throw new Error(
      `sprint.create a répondu ${response.status} : ${JSON.stringify(response.body)}`,
    );
  }
  return response.body;
}

export async function ticketRow(database: TestDatabase, organizationId: string, key: string) {
  const rows = await database.query<{
    id: string;
    project_id: string;
    status: string;
    title: string;
    deleted_at: Date | null;
    assignee_kind: string | null;
    assignee_id: string | null;
    sprint_id: string | null;
  }>(
    `SELECT id, project_id, status, title, deleted_at, assignee_kind, assignee_id, sprint_id
       FROM tickets WHERE organization_id = $1 AND key = $2`,
    [organizationId, key],
  );
  return rows[0];
}

export async function auditRows(database: TestDatabase, organizationId: string) {
  return database.query<{
    action: string;
    target_kind: string;
    target_id: string;
    ticket_id: string | null;
    actor_kind: string;
    actor_id: string | null;
    organization_id: string;
  }>(
    `SELECT action, target_kind, target_id, ticket_id, actor_kind, actor_id, organization_id
       FROM audit_log WHERE organization_id = $1 ORDER BY occurred_at, id`,
    [organizationId],
  );
}

/** Bail inséré par la fixture (TK-31 n'est pas livré : aucune procédure `lease.*`). */
export async function insertLease(
  database: TestDatabase,
  organizationId: string,
  ticketId: string,
  over: { released?: boolean; worktree?: string } = {},
): Promise<void> {
  await database.query(
    `INSERT INTO leases (id, organization_id, ticket_id, holder_kind, holder_id, branch, worktree,
                         acquired_at, heartbeat_at, expires_at, ttl_ms, released_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'runner', 'runner-1', 'feat/tk-x', $4,
             now(), now(), now() + interval '1 hour', 3600000, $5, now(), now())`,
    [
      randomUUID(),
      organizationId,
      ticketId,
      over.worktree ?? "/srv/worktrees/secret-tree",
      over.released ? new Date().toISOString() : null,
    ],
  );
}

/**
 * Application dont le projet courant est imposé : seul moyen de tester l'isolation entre projets
 * d'une même organisation (le contexte v1 résout toujours le plus ancien).
 */
export async function createAppForProject(
  databaseUrl: string,
  projectId: string,
): Promise<INestApplication> {
  const { PROJECT_CONTEXT } = await import("../../src/project/project-context.ts");
  const context = { projectId: async () => projectId };
  const app = (
    await Test.createTestingModule({ imports: [AppModule.forRoot(configFor({ databaseUrl }))] })
      .overrideProvider(PROJECT_CONTEXT)
      .useValue(context)
      .compile()
  ).createNestApplication();
  await app.init();
  return app;
}
