import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contract, type Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import { CaptureMailSender, startWorker, type Worker } from "@koklo/worker";
import type { INestApplication } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { auditRowsFull, commentsFor, UUID_RE } from "./helpers/comments.ts";
import { ENCRYPTION_KEY, INSTALL_APP } from "./helpers/installations.ts";
import { collaborationFor, createAppWithClock, leaseRows, ManualClock } from "./helpers/leases.ts";
import { credentialRows } from "./helpers/llm-credential-routes.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";
import { startQueueBoss } from "./helpers/organizations.ts";
import { createRepoApp, insertInstallation, ProviderHarness, repoApi } from "./helpers/repos.ts";
import {
  apiFor,
  createWorld,
  seedSprint,
  seedTicket,
  send,
  type World,
} from "./helpers/tickets.ts";

/**
 * TK-32, critère 2 : TOUTE procédure d'écriture du contrat 0.4.0 des groupes tracker produit
 * exactement une entrée d'audit. L'énumération est dérivée du contrat (méthode OpenAPI non GET) :
 * une future procédure d'écriture sans scénario fait échouer la garde de complétude.
 */
let database: TestDatabase;
let app: INestApplication;
let boss: PgBoss;

beforeAll(async () => {
  database = await createSeededDatabase();
  boss = await startQueueBoss(database);
  app = await createAppWithClock(database.url, new ManualClock());
});

/**
 * TK-43 : les scénarios `repo.*` ont besoin du fournisseur git (faux en mémoire injecté par
 * GIT_PROVIDER). Application dédiée, créée à la demande : les autres scénarios n'en dépendent pas.
 */
let repoRuntime: Promise<{ app: INestApplication; harness: ProviderHarness }> | undefined;
function repoRuntimeOf() {
  repoRuntime ??= (async () => {
    const clock = new ManualClock();
    const harness = await ProviderHarness.create(clock);
    // TK-48a2 : identifiants client + clé de chiffrement pour que `installation.start` soit disponible.
    const repoApp = await createRepoApp(database.url, {
      clock,
      provider: harness.provider,
      githubApp: INSTALL_APP,
      encryptionKey: ENCRYPTION_KEY,
    });
    return { app: repoApp, harness };
  })();
  return repoRuntime;
}

/**
 * TK-44b : `specBatch.submit` s'exécute de bout en bout (commit par le worker, qui partage la base
 * et le faux fournisseur de l'application `repo`) ; le worker est démarré à la demande.
 */
let specWorker: Promise<Worker> | undefined;
function specWorkerOf() {
  specWorker ??= (async () => {
    const { harness } = await repoRuntimeOf();
    return startWorker(
      {
        databaseUrl: database.url,
        appEnv: "test",
        appVersion: "dev",
        logLevel: "silent",
        sentryDsn: undefined,
        mail: { kind: "capture" },
      },
      { gitProvider: harness.provider, mailSender: new CaptureMailSender() },
    );
  })();
  return specWorker;
}

afterAll(async () => {
  await (await specWorker?.catch(() => undefined))?.stop();
  await (await repoRuntime?.catch(() => undefined))?.app.close();
  await app?.close();
  await boss?.stop();
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

/** Tous les groupes à écriture : organization, member et project se journalisent aussi (audit_log ne requiert que organization_id). */
const WRITE_GROUPS = [
  "organization",
  "member",
  "project",
  "ticket",
  "dependency",
  "sprint",
  "comment",
  "projectState",
  "lease",
  "repo",
  "specBatch",
  "installation",
  "llmCredential",
];
/** Groupes sans écriture à journaliser ici : lecture seule (H3). */
const READ_ONLY_GROUPS = ["audit", "spec"];
/**
 * Groupes du contrat sans implémentation API : plus aucun depuis TK-48a2 (`installation` a rejoint
 * WRITE_GROUPS : `installation.start` est une écriture, `installation.list` une lecture du même groupe,
 * comme `repo.list`). Un futur groupe non implémenté y reviendrait, et la garde ci-dessous le vérifie.
 */
const PENDING_GROUPS: string[] = [];

/** Sources de l'API : une référence à `contract.<groupe>` y signifie qu'une procédure est implémentée. */
function apiSourceFiles(dir = resolve(import.meta.dirname, "../src")): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return apiSourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}
/** Retire les commentaires (bloc et ligne) pour éviter les faux positifs ; approximation volontaire. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** `contract.<g>` (frontière de mot), `contract["g"]`, `contract['g']` ou déstructuration de `contract`. */
function referencesGroup(source: string, group: string): boolean {
  const patterns = [
    new RegExp(`contract\\.${group}\\b`),
    new RegExp(`contract\\[\\s*["']${group}["']\\s*\\]`),
    new RegExp(`\\b(?:const|let|var)\\s*\\{[^}]*\\b${group}\\b[^}]*\\}\\s*=\\s*contract\\b`),
  ];
  return patterns.some((pattern) => pattern.test(source));
}

/** `health` est une procédure isolée (GET), pas un groupe. */
const STANDALONE_PROCEDURES = ["health"];

const EXPECTED_WRITE_PROCEDURES = [
  "comment.create",
  "comment.delete",
  "dependency.add",
  "dependency.remove",
  "installation.start",
  "lease.acquire",
  "lease.heartbeat",
  "lease.release",
  "llmCredential.invalidate",
  "llmCredential.remove",
  "llmCredential.set",
  "member.invite",
  "member.setRole",
  "organization.create",
  "project.create",
  "projectState.update",
  "repo.createSpec",
  "repo.link",
  "specBatch.submit",
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
  /** Organisation qui reçoit l'entrée si ce n'est pas celle du monde (organization.create : la nouvelle). */
  auditOrganization?: (ctx: Ctx, response: Response) => string;
  /** false : l'owner du monde ne peut pas relire cette entrée via audit.list (autre organisation). */
  listable?: boolean;
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

const ofRepo = (action: string, res: Response): Expected => ({
  action,
  targetKind: "repo",
  targetId: res.body.id,
  ticketId: null,
});

/** Installation active d'organisation insérée en base ; `seedRepo` crée le dépôt chez le faux fournisseur. */
function repoPrepare(options: { seedRepo?: string } = {}) {
  return async (ctx: Ctx) => {
    const installation = await insertInstallation(database, ctx.world.organizationId);
    if (options.seedRepo) {
      const { harness } = await repoRuntimeOf();
      await harness.seedRepo(
        { kind: "organization", login: installation.ownerLogin },
        options.seedRepo,
      );
    }
    return { installation };
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
  {
    procedure: "organization.create",
    role: "owner",
    prepare: async () => ({}),
    call: (ctx) =>
      send(app, ctx.world.actors.owner.cookie, "post", "/organizations", { name: "Nouvelle org" }),
    auditOrganization: (_ctx, res) => res.body.id,
    listable: false,
    expected: async (_ctx, _s, res) => ({
      action: "organization.create",
      targetKind: "organization",
      targetId: res.body.id,
      ticketId: null,
    }),
    denied: async (ctx) => {
      const [org] = await database.query<{ slug: string }>(
        "SELECT slug FROM organizations WHERE id = $1",
        [ctx.world.organizationId],
      );
      return send(app, ctx.world.actors.owner.cookie, "post", "/organizations", {
        name: "Doublon",
        slug: org?.slug,
      });
    },
    deniedStatuses: [409],
  },
  {
    procedure: "member.invite",
    role: "owner",
    prepare: async () => ({}),
    call: (ctx) =>
      send(app, ctx.world.actors.owner.cookie, "post", "/members/invitations", {
        email: `invite-${Date.now()}@example.test`,
        role: "dev",
      }),
    expected: async (_ctx, _s, res) => ({
      action: "member.invite",
      targetKind: "invitation",
      targetId: res.body.id,
      ticketId: null,
    }),
    denied: (ctx) =>
      send(app, ctx.world.actors.dev.cookie, "post", "/members/invitations", {
        email: "refus@example.test",
        role: "dev",
      }),
    deniedStatuses: [403],
  },
  {
    procedure: "member.setRole",
    role: "owner",
    prepare: async () => ({}),
    call: async (ctx) => {
      const memberId = ctx.world.actors.dev.memberId;
      const res = await send(
        app,
        ctx.world.actors.owner.cookie,
        "patch",
        `/members/${memberId}/role`,
        { memberId, role: "designer" },
      );
      return res;
    },
    expected: async (ctx) => ({
      action: "member.setRole",
      targetKind: "member",
      targetId: ctx.world.actors.dev.memberId,
      ticketId: null,
    }),
    denied: (ctx) => {
      const memberId = ctx.world.actors.designer.memberId;
      return send(app, ctx.world.actors.dev.cookie, "patch", `/members/${memberId}/role`, {
        memberId,
        role: "client",
      });
    },
    deniedStatuses: [403],
  },
  {
    procedure: "project.create",
    role: "owner",
    prepare: async () => ({}),
    call: (ctx) =>
      send(app, ctx.world.actors.owner.cookie, "post", "/projects", { name: "Nouveau projet" }),
    expected: async (_ctx, _s, res) => ({
      action: "project.create",
      targetKind: "project",
      targetId: res.body.id,
      ticketId: null,
    }),
    denied: (ctx) =>
      send(app, ctx.world.actors.dev.cookie, "post", "/projects", { name: "Refusé" }),
    deniedStatuses: [403],
  },
  {
    procedure: "repo.createSpec",
    role: "owner",
    prepare: repoPrepare(),
    call: async (ctx, s) =>
      repoApi((await repoRuntimeOf()).app, ctx.world.actors.owner).createSpec(
        ctx.world.projectId,
        s.installation.id,
      ),
    expected: async (_ctx, _s, res) => ofRepo("repo.createSpec", res),
    denied: async (ctx, s) =>
      repoApi((await repoRuntimeOf()).app, ctx.world.actors.dev).createSpec(
        ctx.world.projectId,
        s.installation.id,
      ),
    deniedStatuses: [403],
  },
  {
    procedure: "repo.link",
    role: "owner",
    prepare: repoPrepare({ seedRepo: "demo" }),
    call: async (ctx, s) =>
      repoApi((await repoRuntimeOf()).app, ctx.world.actors.owner).link(
        ctx.world.projectId,
        s.installation.id,
        { ownerLogin: s.installation.ownerLogin, name: "demo" },
      ),
    expected: async (_ctx, _s, res) => ofRepo("repo.link", res),
    denied: async (ctx, s) =>
      repoApi((await repoRuntimeOf()).app, ctx.world.actors.dev).link(
        ctx.world.projectId,
        s.installation.id,
        { ownerLogin: s.installation.ownerLogin, name: "demo" },
      ),
    deniedStatuses: [403],
  },
  {
    procedure: "specBatch.submit",
    role: "dev",
    prepare: async (ctx) => {
      const state = await repoPrepare()(ctx);
      await specWorkerOf();
      const created = await repoApi((await repoRuntimeOf()).app, ctx.world.actors.owner).createSpec(
        ctx.world.projectId,
        state.installation.id,
      );
      expect(created.status, JSON.stringify(created.body)).toBe(200);
      return state;
    },
    call: async (ctx) =>
      send(
        (await repoRuntimeOf()).app,
        ctx.world.actors.dev.cookie,
        "post",
        `/projects/${ctx.world.projectId}/spec/batches`,
        {
          projectId: ctx.world.projectId,
          idempotencyKey: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          operations: [{ kind: "feature.create", title: "Auditée", priority: "must" }],
        },
      ),
    expected: async (_ctx, _s, res) => ({
      action: "spec.batch.submit",
      targetKind: "spec_batch",
      targetId: res.body.id,
      ticketId: null,
    }),
    denied: async (ctx) =>
      send(
        (await repoRuntimeOf()).app,
        ctx.world.actors.client.cookie,
        "post",
        `/projects/${ctx.world.projectId}/spec/batches`,
        {
          projectId: ctx.world.projectId,
          idempotencyKey: "refuse",
          operations: [{ kind: "feature.create", title: "Refusée", priority: "must" }],
        },
      ),
    deniedStatuses: [403],
  },
  {
    procedure: "installation.start",
    role: "owner",
    prepare: async () => ({}),
    call: async (ctx) =>
      send(
        (await repoRuntimeOf()).app,
        ctx.world.actors.owner.cookie,
        "post",
        "/provider/installations/start",
        {},
      ),
    expected: async (ctx) => ({
      action: "installation.start",
      targetKind: "organization",
      targetId: ctx.world.organizationId,
      ticketId: null,
    }),
    denied: async (ctx) =>
      send(
        (await repoRuntimeOf()).app,
        ctx.world.actors.dev.cookie,
        "post",
        "/provider/installations/start",
        {},
      ),
    deniedStatuses: [403],
  },
  ...llmCredentialScenarios(),
];

/**
 * TK-52b : clés BYOK. Application avec porte-clés (celle du banc `repo`) ; la clé est une sentinelle
 * factice construite à l'exécution. La cible de l'audit est l'id de la ligne.
 */
const LLM_KEY = makeSentinel();
const llmPath = (suffix = "") => `/llm-credentials/anthropic${suffix}`;

function llmCredentialScenarios(): Scenario[] {
  const appOf = async () => (await repoRuntimeOf()).app;
  const putKey = async (ctx: Ctx, role: Role = "owner") =>
    send(await appOf(), ctx.world.actors[role].cookie, "put", llmPath(), {
      provider: "anthropic",
      apiKey: LLM_KEY,
    });
  const rowId = async (ctx: Ctx) =>
    (await credentialRows(database, ctx.world.organizationId))[0]?.id ?? "";
  const expected = (action: string) => async (ctx: Ctx, state: State) => ({
    action,
    targetKind: "llm_credential",
    targetId: state?.id ?? (await rowId(ctx)),
    ticketId: null,
  });
  const prepared = async (ctx: Ctx) => {
    await putKey(ctx);
    return { id: await rowId(ctx) };
  };
  const as = async (
    ctx: Ctx,
    method: "put" | "post" | "delete",
    suffix: string,
    body?: Record<string, unknown>,
  ) => send(await appOf(), ctx.world.actors.dev.cookie, method, llmPath(suffix), body);
  return [
    {
      procedure: "llmCredential.set",
      role: "owner",
      prepare: async () => ({}),
      call: (ctx) => putKey(ctx),
      expected: expected("llm_credential.create"),
      denied: (ctx) => putKey(ctx, "dev"),
      deniedStatuses: [403],
    },
    {
      procedure: "llmCredential.invalidate",
      role: "owner",
      prepare: prepared,
      call: async (ctx) =>
        send(await appOf(), ctx.world.actors.owner.cookie, "post", llmPath("/invalidate"), {
          provider: "anthropic",
        }),
      expected: expected("llm_credential.invalidate"),
      denied: (ctx) => as(ctx, "post", "/invalidate", { provider: "anthropic" }),
      deniedStatuses: [403],
    },
    {
      procedure: "llmCredential.remove",
      role: "owner",
      prepare: prepared,
      call: async (ctx) => send(await appOf(), ctx.world.actors.owner.cookie, "delete", llmPath()),
      expected: expected("llm_credential.delete"),
      denied: (ctx) => as(ctx, "delete", ""),
      deniedStatuses: [403],
    },
  ];
}

describe("garde de complétude : le contrat dicte les scénarios", () => {
  it("les procédures non-GET des groupes sont exactement les 27 attendues", () => {
    expect(nonGetProcedures(WRITE_GROUPS).sort()).toEqual(EXPECTED_WRITE_PROCEDURES);
  });

  it("chaque procédure d'écriture du contrat a un scénario", () => {
    const covered = new Set(SCENARIOS.map((s) => s.procedure));
    const missing = nonGetProcedures(WRITE_GROUPS).filter((name) => !covered.has(name));
    expect(missing, `procédures d'écriture sans scénario d'audit : ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("aucun scénario ne vise une procédure disparue ou non-écriture", () => {
    const writes = new Set(nonGetProcedures(WRITE_GROUPS));
    const stale = SCENARIOS.map((s) => s.procedure).filter((name) => !writes.has(name));
    expect(stale).toEqual([]);
  });

  it("chaque groupe du contrat est couvert ou en lecture seule : aucune exclusion", () => {
    const known = new Set([
      ...WRITE_GROUPS,
      ...READ_ONLY_GROUPS,
      ...PENDING_GROUPS,
      ...STANDALONE_PROCEDURES,
    ]);
    expect(Object.keys(contract).filter((group) => !known.has(group))).toEqual([]);
    expect(nonGetProcedures(READ_ONLY_GROUPS)).toEqual([]);
  });

  it("un groupe en lecture seule est bel et bien implémenté (la garde ne couvre pas du vide)", () => {
    const sources = apiSourceFiles().map((file) => stripComments(readFileSync(file, "utf8")));
    const missing = READ_ONLY_GROUPS.filter(
      (group) => !sources.some((source) => referencesGroup(source, group)),
    );
    expect(missing, `groupes en lecture seule sans implémentation : ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("le groupe installation est implémenté par l'API (la garde ne couvre pas du vide)", () => {
    const sources = apiSourceFiles().map((file) => stripComments(readFileSync(file, "utf8")));
    expect(sources.some((source) => referencesGroup(source, "installation"))).toBe(true);
  });

  it("un groupe en attente n'a aucune implémentation : sinon il doit rejoindre WRITE_GROUPS ou READ_ONLY_GROUPS", () => {
    const sources = apiSourceFiles().map((file) => stripComments(readFileSync(file, "utf8")));
    const implemented = PENDING_GROUPS.filter((group) =>
      sources.some((source) => referencesGroup(source, group)),
    );
    expect(
      implemented,
      `groupes implémentés mais exclus de la garde d'audit : ${implemented.join(", ")}`,
    ).toEqual([]);
  });
});

describe("garde TK-52b : le groupe llmCredential", () => {
  it("est implémenté par l'API (la garde ne couvre pas du vide)", () => {
    const sources = apiSourceFiles().map((file) => stripComments(readFileSync(file, "utf8")));
    expect(sources.some((source) => referencesGroup(source, "llmCredential"))).toBe(true);
  });
});

async function checkSuccess(scenario: Scenario) {
  const ctx = { world: await createWorld(database) };
  const state = await scenario.prepare(ctx);
  // L'organisation créée par organization.create n'existe pas avant l'appel : journal vide.
  const before = scenario.auditOrganization
    ? []
    : await auditRowsFull(database, ctx.world.organizationId);

  const response = await scenario.call(ctx, state);
  expect(response.status, JSON.stringify(response.body)).toBe(200);

  const auditOrganizationId =
    scenario.auditOrganization?.(ctx, response) ?? ctx.world.organizationId;
  const after = await auditRowsFull(database, auditOrganizationId);
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
  // organization.create : l'entrée vit dans la nouvelle organisation, que la session de l'owner (organisation active du monde) ne peut pas relire ; le succès est vérifié en base.
  it.skipIf(scenario.listable === false)(
    "est restituée par audit.list (owner), avec ticketKey quand elle vise un ticket",
    () => checkListed(scenario),
  );
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
