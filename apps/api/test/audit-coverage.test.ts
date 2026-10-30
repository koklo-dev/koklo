import { contract, type Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { auditRowsFull, commentsFor, UUID_RE } from "./helpers/comments.ts";
import { collaborationFor, createAppWithClock, leaseRows, ManualClock } from "./helpers/leases.ts";
import { apiFor, createWorld, seedSprint, seedTicket, type World } from "./helpers/tickets.ts";

/**
 * TK-32, critère 2 : TOUTE procédure d'écriture du contrat 0.4.0 des groupes tracker produit
 * exactement une entrée d'audit. L'énumération est dérivée du contrat (méthode OpenAPI non GET) :
 * une future procédure d'écriture sans scénario fait échouer la garde de complétude.
 */
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

type Procedure = { "~orpc": { meta: { "~openapi"?: { method?: string } } } };
const groups = contract as unknown as Record<string, Record<string, Procedure>>;

function nonGetProcedures(groupNames: readonly string[]): string[] {
  return groupNames.flatMap((group) =>
    Object.entries(groups[group] ?? {})
      .filter(([, procedure]) => procedure["~orpc"].meta["~openapi"]?.method !== "GET")
      .map(([name]) => `${group}.${name}`),
  );
}

const TRACKER_GROUPS = ["ticket", "dependency", "sprint", "comment", "projectState", "lease"];
/** Groupes sans écriture à journaliser ici : lecture seule (H3). */
const READ_ONLY_GROUPS = ["audit"];
/** `health` est une procédure isolée (GET), pas un groupe. */
const STANDALONE_PROCEDURES = ["health"];
/** Exclusions nommées et justifiées (H3, Q2 de l'analyse) : jamais un oubli silencieux. */
const EXCLUDED_GROUPS: Record<string, string> = {
  organization: "hors ProjectScope : journalisation à arbitrer (Q2), ticket de suivi",
  member: "hors ProjectScope : journalisation à arbitrer (Q2), ticket de suivi",
  project: "hors ProjectScope : journalisation à arbitrer (Q2), ticket de suivi",
};

const EXPECTED_WRITE_PROCEDURES = [
  "comment.create",
  "comment.delete",
  "dependency.add",
  "dependency.remove",
  "lease.acquire",
  "lease.heartbeat",
  "lease.release",
  "projectState.update",
  "sprint.activate",
  "sprint.close",
  "sprint.create",
  "sprint.update",
  "ticket.create",
  "ticket.delete",
  "ticket.transition",
  "ticket.update",
];

// biome-ignore lint/suspicious/noExplicitAny: état hétérogène propre à chaque scénario
type State = any;

interface Ctx {
  world: World;
}
type Response = { status: number; body: { id: string; key: string } & Record<string, unknown> };
interface Expected {
  action: string;
  targetKind: string;
  targetId: string;
  ticketId: string | null;
  ticketKey?: string;
}
interface Scenario {
  procedure: string;
  /** Rôle autorisé qui réussit. */
  role: Role;
  /** Prépare l'état par l'API (les entrées d'audit de la préparation précèdent le snapshot). */
  prepare: (ctx: Ctx) => Promise<State>;
  call: (ctx: Ctx, state: State) => Promise<Response>;
  expected: (ctx: Ctx, state: State, response: Response) => Promise<Expected>;
  /** Appel refusé (403, 404, 409, 422) : aucune entrée ne doit apparaître. */
  denied: (ctx: Ctx, state: State) => Promise<Response>;
  deniedStatuses: number[];
}

const tickets = (ctx: Ctx, role: Role = "dev") => apiFor(app, ctx.world.actors[role]);
const collab = (ctx: Ctx, role: Role = "dev") => collaborationFor(app, ctx.world.actors[role]);
const comments = (ctx: Ctx, role: Role = "dev") => commentsFor(app, ctx.world.actors[role]);
const seed = (ctx: Ctx, over: Record<string, unknown> = {}) =>
  seedTicket(app, ctx.world.actors.dev, over);

const ofTicket = (action: string, ticket: { id: string; key: string }): Expected => ({
  action,
  targetKind: "ticket",
  targetId: ticket.id,
  ticketId: ticket.id,
  ticketKey: ticket.key,
});

async function leaseExpected(action: string, ticket: { id: string; key: string }) {
  const [lease] = await leaseRows(database, ticket.id);
  return {
    action,
    targetKind: "lease",
    targetId: lease?.id ?? "",
    ticketId: ticket.id,
    ticketKey: ticket.key,
  };
}

const SCENARIOS: Scenario[] = [
  {
    procedure: "ticket.create",
    role: "dev",
    prepare: async () => ({}),
    call: (ctx) => tickets(ctx).createTicket({ status: "todo" }),
    expected: async (_ctx, _s, res) =>
      ofTicket("ticket.create", res.body as { id: string; key: string }),
    denied: (ctx) => tickets(ctx, "client").createTicket(),
    deniedStatuses: [403],
  },
  {
    procedure: "ticket.update",
    role: "dev",
    prepare: (ctx) => seed(ctx),
    call: (ctx, t) => tickets(ctx).updateTicket(t.key, { title: "Modifié" }),
    expected: async (_ctx, t) => ofTicket("ticket.update", t),
    denied: (ctx) => tickets(ctx).updateTicket("TK-999", { title: "x" }),
    deniedStatuses: [404],
  },
  {
    procedure: "ticket.delete",
    role: "dev",
    prepare: (ctx) => seed(ctx),
    call: (ctx, t) => tickets(ctx).deleteTicket(t.key),
    expected: async (_ctx, t) => ofTicket("ticket.delete", t),
    denied: (ctx, t) => tickets(ctx, "business").deleteTicket(t.key),
    deniedStatuses: [403],
  },
  {
    procedure: "ticket.transition",
    role: "dev",
    prepare: (ctx) => seed(ctx),
    call: (ctx, t) => tickets(ctx).transition(t.key, "in_progress"),
    expected: async (_ctx, t) => ofTicket("ticket.transition", t),
    denied: (ctx) => tickets(ctx).transition("TK-999", "in_progress"),
    deniedStatuses: [404],
  },
  {
    procedure: "dependency.add",
    role: "dev",
    prepare: async (ctx) => ({ a: await seed(ctx), b: await seed(ctx) }),
    call: (ctx, s) => tickets(ctx).addDependency(s.b.key, s.a.key),
    expected: async (_ctx, s) => ofTicket("dependency.add", s.b),
    denied: (ctx, s) => tickets(ctx).addDependency(s.a.key, s.a.key),
    deniedStatuses: [400, 422],
  },
  {
    procedure: "dependency.remove",
    role: "dev",
    prepare: async (ctx) => {
      const a = await seed(ctx);
      const b = await seed(ctx);
      await tickets(ctx).addDependency(b.key, a.key);
      return { a, b };
    },
    call: (ctx, s) => tickets(ctx).removeDependency(s.b.key, s.a.key),
    expected: async (_ctx, s) => ofTicket("dependency.remove", s.b),
    denied: (ctx, s) => tickets(ctx, "client").removeDependency(s.b.key, s.a.key),
    deniedStatuses: [403],
  },
  {
    procedure: "sprint.create",
    role: "dev",
    prepare: async () => ({}),
    call: (ctx) => tickets(ctx).createSprint(),
    expected: async (_ctx, _s, res) => ({
      action: "sprint.create",
      targetKind: "sprint",
      targetId: res.body.id,
      ticketId: null,
    }),
    denied: (ctx) => tickets(ctx, "client").createSprint(),
    deniedStatuses: [403],
  },
  {
    procedure: "sprint.update",
    role: "dev",
    prepare: (ctx) => seedSprint(app, ctx.world.actors.dev),
    call: (ctx, sp) => tickets(ctx).updateSprint(sp.key, { goal: "Autre" }),
    expected: async (_ctx, sp) => ({
      action: "sprint.update",
      targetKind: "sprint",
      targetId: sp.id,
      ticketId: null,
    }),
    denied: (ctx) => tickets(ctx).updateSprint("SP-999", { goal: "x" }),
    deniedStatuses: [404],
  },
  {
    procedure: "sprint.activate",
    role: "dev",
    prepare: (ctx) => seedSprint(app, ctx.world.actors.dev),
    call: (ctx, sp) => tickets(ctx).activateSprint(sp.key),
    expected: async (_ctx, sp) => ({
      action: "sprint.activate",
      targetKind: "sprint",
      targetId: sp.id,
      ticketId: null,
    }),
    denied: (ctx, sp) => tickets(ctx, "business").activateSprint(sp.key),
    deniedStatuses: [403],
  },
  {
    procedure: "sprint.close",
    role: "dev",
    prepare: async (ctx) => {
      const sprint = await seedSprint(app, ctx.world.actors.dev);
      await tickets(ctx).activateSprint(sprint.key);
      return sprint;
    },
    call: (ctx, sp) => tickets(ctx).closeSprint(sp.key),
    expected: async (_ctx, sp) => ({
      action: "sprint.close",
      targetKind: "sprint",
      targetId: sp.id,
      ticketId: null,
    }),
    denied: (ctx, sp) => tickets(ctx, "client").closeSprint(sp.key),
    deniedStatuses: [403],
  },
  {
    procedure: "comment.create",
    role: "dev",
    prepare: (ctx) => seed(ctx),
    call: (ctx, t) => comments(ctx).create(t.id, "Un commentaire"),
    expected: async (_ctx, t, res) => ({
      action: "comment.create",
      targetKind: "comment",
      targetId: res.body.id,
      ticketId: t.id,
      ticketKey: t.key,
    }),
    denied: (ctx, t) => comments(ctx, "business").create(t.id),
    deniedStatuses: [403],
  },
  {
    procedure: "comment.delete",
    role: "dev",
    prepare: async (ctx) => {
      const ticket = await seed(ctx);
      const comment = (await comments(ctx).create(ticket.id)).body;
      return { ticket, comment };
    },
    call: (ctx, s) => comments(ctx).remove(s.comment.id),
    expected: async (_ctx, s) => ({
      action: "comment.delete",
      targetKind: "comment",
      targetId: s.comment.id,
      ticketId: s.ticket.id,
      ticketKey: s.ticket.key,
    }),
    denied: (ctx) => comments(ctx).remove("00000000-0000-4000-8000-000000000000"),
    deniedStatuses: [404],
  },
  {
    procedure: "projectState.update",
    role: "owner",
    prepare: async (ctx) => {
      await collab(ctx, "owner").getState();
    },
    call: (ctx) => collab(ctx, "owner").updateState(1, { a: 1 }),
    expected: async (ctx) => {
      const [state] = await database.query<{ id: string }>(
        "SELECT id FROM project_states WHERE project_id = $1",
        [ctx.world.projectId],
      );
      return {
        action: "project_state.update",
        targetKind: "project_state",
        targetId: state?.id ?? "",
        ticketId: null,
      };
    },
    denied: (ctx) => collab(ctx, "owner").updateState(9, {}),
    deniedStatuses: [409],
  },
  {
    procedure: "lease.acquire",
    role: "dev",
    prepare: (ctx) => seed(ctx),
    call: (ctx, t) => collab(ctx).acquire(t.key),
    expected: (_ctx, t) => leaseExpected("lease.acquire", t),
    denied: (ctx, t) => collab(ctx, "designer").acquire(t.key),
    deniedStatuses: [403],
  },
  {
    procedure: "lease.heartbeat",
    role: "dev",
    prepare: async (ctx) => {
      const ticket = await seed(ctx);
      await collab(ctx).acquire(ticket.key);
      return ticket;
    },
    call: (ctx, t) => collab(ctx).heartbeat(t.key),
    expected: (_ctx, t) => leaseExpected("lease.heartbeat", t),
    denied: (ctx, t) => collab(ctx, "client").heartbeat(t.key),
    deniedStatuses: [403],
  },
  {
    procedure: "lease.release",
    role: "dev",
    prepare: async (ctx) => {
      const ticket = await seed(ctx);
      await collab(ctx).acquire(ticket.key);
      return ticket;
    },
    call: (ctx, t) => collab(ctx).release(t.key),
    expected: (_ctx, t) => leaseExpected("lease.release", t),
    denied: (ctx, t) => collab(ctx, "client").release(t.key),
    deniedStatuses: [403],
  },
];

describe("garde de complétude : le contrat dicte les scénarios", () => {
  it("les procédures non-GET des groupes tracker sont exactement les 16 attendues", () => {
    expect(nonGetProcedures(TRACKER_GROUPS).sort()).toEqual(EXPECTED_WRITE_PROCEDURES);
  });

  it("chaque procédure d'écriture du contrat a un scénario", () => {
    const covered = new Set(SCENARIOS.map((s) => s.procedure));
    const missing = nonGetProcedures(TRACKER_GROUPS).filter((name) => !covered.has(name));
    expect(missing, `procédures d'écriture sans scénario d'audit : ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("aucun scénario ne vise une procédure disparue ou non-écriture", () => {
    const writes = new Set(nonGetProcedures(TRACKER_GROUPS));
    const stale = SCENARIOS.map((s) => s.procedure).filter((name) => !writes.has(name));
    expect(stale).toEqual([]);
  });

  it("chaque groupe du contrat est couvert, en lecture seule ou exclu avec justification", () => {
    const known = new Set([
      ...TRACKER_GROUPS,
      ...READ_ONLY_GROUPS,
      ...STANDALONE_PROCEDURES,
      ...Object.keys(EXCLUDED_GROUPS),
    ]);
    expect(Object.keys(contract).filter((group) => !known.has(group))).toEqual([]);
    for (const [group, why] of Object.entries(EXCLUDED_GROUPS)) {
      expect(why.length).toBeGreaterThan(10);
      expect(nonGetProcedures([group]).length, `${group} exclu sans écriture`).toBeGreaterThan(0);
    }
    expect(nonGetProcedures(READ_ONLY_GROUPS)).toEqual([]);
  });
});

async function checkSuccess(scenario: Scenario) {
  const ctx = { world: await createWorld(database) };
  const state = await scenario.prepare(ctx);
  const before = await auditRowsFull(database, ctx.world.organizationId);

  const response = await scenario.call(ctx, state);
  expect(response.status, JSON.stringify(response.body)).toBe(200);

  const after = await auditRowsFull(database, ctx.world.organizationId);
  const created = after.slice(before.length);
  expect(created).toHaveLength(1);
  const expected = await scenario.expected(ctx, state, response);
  const [row] = created;
  expect(row).toMatchObject({
    action: expected.action,
    target_kind: expected.targetKind,
    target_id: expected.targetId,
    ticket_id: expected.ticketId,
    actor_kind: "human",
    actor_id: ctx.world.actors[scenario.role].userId,
  });
  expect(row?.target_id).toMatch(UUID_RE);
  const last = before.at(-1);
  if (last && row) {
    expect(row.occurred_at.getTime()).toBeGreaterThanOrEqual(last.occurred_at.getTime());
  }
}

async function checkListed(scenario: Scenario) {
  const ctx = { world: await createWorld(database) };
  const state = await scenario.prepare(ctx);
  const response = await scenario.call(ctx, state);
  expect(response.status).toBe(200);
  const expected = await scenario.expected(ctx, state, response);

  const listed = await commentsFor(app, ctx.world.actors.owner).listAudit(
    `action=${encodeURIComponent(expected.action)}&limit=100`,
  );
  expect(listed.status, JSON.stringify(listed.body)).toBe(200);
  const entry = listed.body.items.find(
    (item: { targetId: string }) => item.targetId === expected.targetId,
  );
  expect(entry).toMatchObject({
    action: expected.action,
    targetKind: expected.targetKind,
    actorKind: "human",
    actorId: ctx.world.actors[scenario.role].userId,
  });
  if (expected.ticketKey) {
    expect(entry.ticketKey).toBe(expected.ticketKey);
  } else {
    expect(entry).not.toHaveProperty("ticketKey");
  }
}

async function checkDenied(scenario: Scenario) {
  const ctx = { world: await createWorld(database) };
  const state = await scenario.prepare(ctx);
  const before = await auditRowsFull(database, ctx.world.organizationId);

  const response = await scenario.denied(ctx, state);

  expect(scenario.deniedStatuses).toContain(response.status);
  // Un refus métier porte un code d'erreur du contrat ; une route absente (404 brut) n'en a pas.
  expect(response.body.code).toEqual(expect.any(String));
  expect(await auditRowsFull(database, ctx.world.organizationId)).toHaveLength(before.length);
}

describe.each(SCENARIOS)("$procedure", (scenario) => {
  it("réussit avec une seule nouvelle entrée exacte (action, cible, acteur, ticket)", () =>
    checkSuccess(scenario));
  it("est restituée par audit.list (owner), avec ticketKey quand elle vise un ticket", () =>
    checkListed(scenario));
  it("refusée (403, 404, 409 ou 422) : aucune entrée n'est ajoutée", () => checkDenied(scenario));
});

describe("exception documentée : dependency.add d'une arête déjà posée", () => {
  it("la première pose produit une entrée, la seconde (no-op idempotent) n'en produit aucune", async () => {
    const ctx = { world: await createWorld(database) };
    const a = await seed(ctx);
    const b = await seed(ctx);
    const dev = tickets(ctx);
    const count = async () =>
      (await auditRowsFull(database, ctx.world.organizationId)).filter(
        (r) => r.action === "dependency.add",
      ).length;

    expect((await dev.addDependency(b.key, a.key)).status).toBe(200);
    expect(await count()).toBe(1);
    const before = (await auditRowsFull(database, ctx.world.organizationId)).length;

    expect((await dev.addDependency(b.key, a.key)).status).toBe(200);

    expect(await count()).toBe(1);
    expect((await auditRowsFull(database, ctx.world.organizationId)).length).toBe(before);
  });
});
