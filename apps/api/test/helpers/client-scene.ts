import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { type Actor, insertActor, insertOrganization } from "./organizations.ts";
import {
  createAppForProject,
  insertLease,
  insertProject,
  seedSprint,
  seedTicket,
  send,
} from "./tickets.ts";

/** Rôles d'équipe et business : ils voient toute l'organisation (CDC §14), seul le client est cloisonné. */
export const STAFF = ["owner", "admin", "dev", "designer", "business"] as const;
export type StaffRole = (typeof STAFF)[number];

/**
 * Scène de cloisonnement (TK-55a) : l'organisation A a trois projets (`old` le plus ancien, `p1`,
 * `p2`), les cinq rôles d'équipe, trois clients (c1 lié à p1, c2 lié à p2, c3 sans lien) ; une
 * organisation étrangère a son projet et son client lié. Les liens sont insérés en SQL : ces
 * tests ne dépendent pas des procédures `projectClient.*`.
 */
export interface ClientScene {
  organizationId: string;
  projects: { old: string; p1: string; p2: string };
  staff: Record<StaffRole, Actor>;
  c1: Actor;
  c2: Actor;
  c3: Actor;
  foreign: { organizationId: string; projectId: string; owner: Actor; client: Actor };
}

/** Lie un membre au projet (ce que fera `projectClient.add`), directement en base. */
export async function linkClient(
  database: TestDatabase,
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<string> {
  const id = randomUUID();
  await database.query(
    `INSERT INTO project_client_access (id, organization_id, project_id, user_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [id, organizationId, projectId, userId],
  );
  return id;
}

export async function linkedProjectsOf(
  database: TestDatabase,
  organizationId: string,
  userId: string,
): Promise<string[]> {
  const rows = await database.query<{ project_id: string }>(
    `SELECT project_id FROM project_client_access
      WHERE organization_id = $1 AND user_id = $2 ORDER BY project_id`,
    [organizationId, userId],
  );
  return rows.map((row) => row.project_id);
}

let scenes = 0;

export async function createClientScene(database: TestDatabase): Promise<ClientScene> {
  const stamp = `${Date.now()}-${++scenes}`;
  const organizationId = await insertOrganization(database, `tk55a-${stamp}`);
  const old = await insertProject(
    database,
    organizationId,
    "Projet ancien",
    "2026-01-01T00:00:00Z",
  );
  const p1 = await insertProject(
    database,
    organizationId,
    "Projet client 1",
    "2026-01-02T00:00:00Z",
  );
  const p2 = await insertProject(
    database,
    organizationId,
    "Projet client 2",
    "2026-01-03T00:00:00Z",
  );
  const staff = {} as Record<StaffRole, Actor>;
  for (const role of STAFF) staff[role] = await insertActor(database, organizationId, role);
  const c1 = await insertActor(database, organizationId, "client", "client1");
  const c2 = await insertActor(database, organizationId, "client", "client2");
  const c3 = await insertActor(database, organizationId, "client", "client3");
  await linkClient(database, organizationId, p1, c1.userId);
  await linkClient(database, organizationId, p2, c2.userId);

  const foreignOrg = await insertOrganization(database, `tk55a-foreign-${stamp}`);
  const foreignProject = await insertProject(database, foreignOrg, "Projet étranger");
  const foreignOwner = await insertActor(database, foreignOrg, "owner", "foreign-owner");
  const foreignClient = await insertActor(database, foreignOrg, "client", "foreign-client");
  await linkClient(database, foreignOrg, foreignProject, foreignClient.userId);

  return {
    organizationId,
    projects: { old, p1, p2 },
    staff,
    c1,
    c2,
    c3,
    foreign: {
      organizationId: foreignOrg,
      projectId: foreignProject,
      owner: foreignOwner,
      client: foreignClient,
    },
  };
}

export interface SeededItem {
  key: string;
  id: string;
}
export interface SeededProject {
  tickets: SeededItem[];
  sprints: SeededItem[];
}
export interface SeededTickets {
  /** Par projet ; les clés sont `TK-1..TK-n` et `SP-1..SP-m` dans chaque projet (n, m différents). */
  old: SeededProject;
  p1: SeededProject;
  p2: SeededProject;
  foreign: SeededProject;
}

/** Chemin du worktree du bail de p1 : ne doit jamais apparaître dans la réponse d'un autre client. */
export const P1_WORKTREE = "/srv/worktrees/p1-secret-tree";

/**
 * Sème par l'API de l'owner, projet par projet (application au projet imposé) : old 1 ticket et
 * 1 sprint, p1 2 tickets et 1 sprint, p2 3 tickets et 2 sprints, étranger 1 ticket et 1 sprint.
 * Titres de ticket `secret-<projet>-<n>`, objectif de sprint `goal-<projet>-<n>`. Un bail actif est
 * posé en SQL sur le ticket `TK-2` de p1.
 */
export async function seedWork(database: TestDatabase, scene: ClientScene): Promise<SeededTickets> {
  const databaseUrl = database.url;
  const plan = [
    ["old", scene.projects.old, scene.staff.owner, 1, 1],
    ["p1", scene.projects.p1, scene.staff.owner, 2, 1],
    ["p2", scene.projects.p2, scene.staff.owner, 3, 2],
    ["foreign", scene.foreign.projectId, scene.foreign.owner, 1, 1],
  ] as const;
  const empty = (): SeededProject => ({ tickets: [], sprints: [] });
  const out: SeededTickets = { old: empty(), p1: empty(), p2: empty(), foreign: empty() };
  for (const [name, projectId, owner, tickets, sprints] of plan) {
    const app = await createAppForProject(databaseUrl, projectId);
    try {
      for (let n = 1; n <= tickets; n++) {
        const ticket = await seedTicket(app, owner, { title: `secret-${name}-${n}` });
        out[name].tickets.push({ key: ticket.key, id: ticket.id });
      }
      for (let n = 1; n <= sprints; n++) {
        const sprint = await seedSprint(app, owner, { goal: `goal-${name}-${n}` });
        out[name].sprints.push({ key: sprint.key, id: sprint.id });
      }
    } finally {
      await app.close();
    }
  }
  const leased = out.p1.tickets[1] as SeededItem;
  await insertLease(database, scene.organizationId, leased.id, { worktree: P1_WORKTREE });
  return out;
}

/** Corps d'une réponse sans l'identifiant de requête : base de comparaison des 404 uniformes. */
export function stripRequestId(body: unknown): unknown {
  return JSON.parse(
    JSON.stringify(body, (key, value) => (key === "requestId" ? undefined : value)),
  );
}

/** Statut + corps (sans requestId) : deux refus « ressource inaccessible » doivent être identiques. */
export function shapeOf(res: { status: number; body: unknown }) {
  return { status: res.status, body: stripRequestId(res.body) };
}

export const getAs = (app: INestApplication, actor: Pick<Actor, "cookie">, path: string) =>
  send(app, actor.cookie, "get", path);

/** Médiane (ms) de `n` appels : base du test « même durée approximative ». */
export async function medianDuration(n: number, run: () => Promise<unknown>): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] as number;
}
