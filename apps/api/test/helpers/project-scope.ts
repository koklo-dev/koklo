import { randomUUID } from "node:crypto";
import { contract } from "@koklo/contract";
import type { INestApplication } from "@nestjs/common";
import { commentsFor } from "./comments.ts";
import { collaborationFor } from "./leases.ts";
import type { Actor } from "./organizations.ts";
import { apiFor, projectPath, seedSprint, seedTicket, type World } from "./tickets.ts";

/**
 * TK-96 : les 25 procédures de pilotage qui reçoivent `projectId` (liste fermée, gardée contre le
 * contrat), chacune avec la requête HTTP qui l'exerce et l'issue attendue d'un client lié à son projet.
 */
export interface Fixture {
  t1: string;
  t2: string;
  t3: string;
  t1Id: string;
  sprint: string;
  commentId: string;
  version: number;
}

/** Valeurs plausibles mais fictives : suffisent aux requêtes qui n'atteindront jamais le projet. */
export const FAKE: Fixture = {
  t1: "TK-1",
  t2: "TK-2",
  t3: "TK-3",
  t1Id: "11111111-1111-4111-8111-111111111111",
  sprint: "SP-1",
  commentId: "22222222-2222-4222-8222-222222222222",
  version: 1,
};

export interface Call {
  method: "get" | "post" | "patch" | "put" | "delete";
  suffix: string;
  body?: Record<string, unknown>;
}

/** `client` : statut d'un client lié à son projet ; `own` : seulement sur un commentaire de lui. */
export interface Procedure {
  name: string;
  client: 200 | 403 | "own";
  call: (f: Fixture) => Call;
  /** Prépare l'état que la procédure exige (bail, sprint actif…) avant l'appel de l'équipe. */
  setup?: (api: ReturnType<typeof apiFor>, f: Fixture) => Promise<unknown>;
}

const NEW_TICKET = {
  title: "Nouveau",
  type: "task",
  priority: "low",
  pkg: "api",
  sensitivity: "safe",
};
const NEW_SPRINT = { goal: "Objectif", startsOn: "2026-12-01", endsOn: "2026-12-12" };
const LEASE = { branch: "feat/tk-x", worktree: "/srv/worktrees/tk-x" };

export const PROCEDURES: Procedure[] = [
  {
    name: "ticket.create",
    client: 403,
    call: () => ({ method: "post", suffix: "/tickets", body: NEW_TICKET }),
  },
  { name: "ticket.get", client: 200, call: (f) => ({ method: "get", suffix: `/tickets/${f.t1}` }) },
  { name: "ticket.list", client: 200, call: () => ({ method: "get", suffix: "/tickets" }) },
  {
    name: "ticket.update",
    client: 403,
    call: (f) => ({
      method: "patch",
      suffix: `/tickets/${f.t1}`,
      body: { key: f.t1, title: "Modifié" },
    }),
  },
  {
    name: "ticket.delete",
    client: 403,
    call: (f) => ({ method: "delete", suffix: `/tickets/${f.t3}` }),
  },
  {
    name: "ticket.transition",
    client: 403,
    call: (f) => ({
      method: "post",
      suffix: `/tickets/${f.t3}/transition`,
      body: { key: f.t3, to: "in_progress" },
    }),
  },
  {
    name: "dependency.add",
    client: 403,
    call: (f) => ({
      method: "post",
      suffix: `/tickets/${f.t3}/dependencies`,
      body: { key: f.t3, dependsOn: f.t2, type: "blocks" },
    }),
  },
  {
    name: "dependency.remove",
    client: 403,
    call: (f) => ({
      method: "delete",
      suffix: `/tickets/${f.t1}/dependencies/${f.t2}`,
      body: { type: "blocks" },
    }),
  },
  {
    name: "dependency.list",
    client: 200,
    call: (f) => ({ method: "get", suffix: `/tickets/${f.t1}/dependencies` }),
  },
  {
    name: "sprint.create",
    client: 403,
    call: () => ({ method: "post", suffix: "/sprints", body: NEW_SPRINT }),
  },
  {
    name: "sprint.get",
    client: 200,
    call: (f) => ({ method: "get", suffix: `/sprints/${f.sprint}` }),
  },
  { name: "sprint.list", client: 200, call: () => ({ method: "get", suffix: "/sprints" }) },
  {
    name: "sprint.update",
    client: 403,
    call: (f) => ({
      method: "patch",
      suffix: `/sprints/${f.sprint}`,
      body: { key: f.sprint, goal: "Autre" },
    }),
  },
  {
    name: "sprint.activate",
    client: 403,
    call: (f) => ({
      method: "post",
      suffix: `/sprints/${f.sprint}/activate`,
      body: { key: f.sprint },
    }),
  },
  {
    name: "sprint.close",
    client: 403,
    call: (f) => ({
      method: "post",
      suffix: `/sprints/${f.sprint}/close`,
      body: { key: f.sprint },
    }),
    setup: (api, f) => api.activateSprint(f.sprint),
  },
  {
    name: "comment.create",
    client: 200,
    call: (f) => ({
      method: "post",
      suffix: "/comments",
      body: { targetKind: "ticket", targetId: f.t1Id, body: "Un commentaire" },
    }),
  },
  {
    name: "comment.list",
    client: 200,
    call: (f) => ({ method: "get", suffix: `/comments?targetKind=ticket&targetId=${f.t1Id}` }),
  },
  {
    name: "comment.delete",
    client: "own",
    call: (f) => ({ method: "delete", suffix: `/comments/${f.commentId}` }),
  },
  {
    name: "projectState.get",
    client: 403,
    call: () => ({ method: "get", suffix: "/project-state" }),
  },
  {
    name: "projectState.update",
    client: 403,
    call: (f) => ({
      method: "put",
      suffix: "/project-state",
      body: { expectedVersion: f.version, content: { a: 1 } },
    }),
  },
  {
    name: "lease.acquire",
    client: 403,
    call: (f) => ({
      method: "post",
      suffix: `/tickets/${f.t2}/lease`,
      body: { key: f.t2, ...LEASE },
    }),
  },
  {
    name: "lease.heartbeat",
    client: 403,
    call: (f) => ({
      method: "post",
      suffix: `/tickets/${f.t1}/lease/heartbeat`,
      body: { key: f.t1 },
    }),
  },
  {
    name: "lease.release",
    client: 403,
    call: (f) => ({ method: "delete", suffix: `/tickets/${f.t1}/lease` }),
  },
  {
    name: "lease.get",
    client: 200,
    call: (f) => ({ method: "get", suffix: `/tickets/${f.t1}/lease` }),
  },
  { name: "audit.list", client: 403, call: () => ({ method: "get", suffix: "/audit" }) },
];

const GROUPS = ["ticket", "dependency", "sprint", "comment", "projectState", "lease", "audit"];

/** Procédures du contrat dont le chemin est `/projects/{projectId}/…` parmi les groupes de pilotage. */
export function contractProcedures(): string[] {
  const out: string[] = [];
  for (const group of GROUPS) {
    const node = (contract as unknown as Record<string, Record<string, unknown>>)[group] ?? {};
    for (const name of Object.keys(node)) out.push(`${group}.${name}`);
  }
  return out.sort();
}

/** Crée l'état complet d'un projet : trois tickets, un sprint, un commentaire, un bail, une arête. */
export async function prepare(app: INestApplication, world: World, owner: Actor): Promise<Fixture> {
  const { projectId } = world;
  const api = apiFor(app, owner, projectId);
  const t1 = await seedTicket(app, owner, projectId);
  const t2 = await seedTicket(app, owner, projectId);
  const t3 = await seedTicket(app, owner, projectId);
  const sprint = await seedSprint(app, owner, projectId);
  const comment = await commentsFor(app, owner, projectId).create(t1.id);
  await api.addDependency(t1.key, t2.key);
  const collaboration = collaborationFor(app, owner, projectId);
  await collaboration.acquire(t1.key);
  const state = await collaboration.getState();
  return {
    t1: t1.key,
    t2: t2.key,
    t3: t3.key,
    t1Id: t1.id,
    sprint: sprint.key,
    commentId: comment.body.id,
    version: state.body.version,
  };
}

export const pathOf = (projectId: string, call: Call) => projectPath(projectId, call.suffix);
export const unknownProject = () => randomUUID();
