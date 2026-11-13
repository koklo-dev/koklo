import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contract, type Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import { CaptureMailSender, startWorker, type Worker } from "@koklo/worker";
import type { INestApplication } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_ADAPTERS } from "../src/ai/ai-tokens.ts";
import { NONCE_SOURCE } from "../src/ai/nonce.ts";
import { AI_ROUTES, PurposeLlm } from "./helpers/ai-bench.ts";
import { createSeededDatabase } from "./helpers/app.ts";
import { auditRowsFull, commentsFor, UUID_RE } from "./helpers/comments.ts";
import { ENCRYPTION_KEY, INSTALL_APP } from "./helpers/installations.ts";
import { collaborationFor, createAppWithClock, leaseRows, ManualClock } from "./helpers/leases.ts";
import { credentialRows } from "./helpers/llm-credential-routes.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";
import { insertActor, startQueueBoss } from "./helpers/organizations.ts";
import { linkRows, projectClientApi } from "./helpers/project-client.ts";
import { freezeIdea, insertProposal, PROPOSAL_ROUTES } from "./helpers/proposals.ts";
import type { RepoBench } from "./helpers/repo-scene.ts";
import { createRepoApp, insertInstallation, ProviderHarness, repoApi } from "./helpers/repos.ts";
import { reviewApi } from "./helpers/reviews.ts";
import { settingsApi } from "./helpers/settings.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import { suggestionApi } from "./helpers/suggestions.ts";
import {
  apiFor,
  createWorld,
  linkClient,
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
      // TK-54b : les procédures ai.* et llmCredential.verify tournent sur un faux modèle (jamais le réseau).
      configure: aiOverrides(),
    });
    return { app: repoApp, harness };
  })();
  return repoRuntime;
}

/**
 * TK-54b : modèle simulé des scénarios ai.* (réponse valide par finalité), sous le jeton `AI_ADAPTERS`
 * et un nonce déterministe ; le faux n'est jamais choisi par la configuration.
 */
function aiOverrides() {
  return (builder: import("@nestjs/testing").TestingModuleBuilder) => {
    return builder
      .overrideProvider(AI_ADAPTERS)
      .useValue(() => new PurposeLlm())
      .overrideProvider(NONCE_SOURCE)
      .useValue({ next: () => "c".repeat(48) });
  };
}

/**
 * TK-44b : `specBatch.submit s'exécute de bout en bout (commit par le worker, qui partage la base
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
        webBaseUrl: "http://localhost:3000",
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

/**
 * Écritures volontairement hors journal : une préférence personnelle, sans effet sur les données ni les droits
 * (TK-88, B80). `project.visit` mémorise le dernier projet ouvert ; journaliser chaque ouverture noierait l'audit.
 * Liste fermée : toute autre écriture doit avoir son scénario.
 */
const UNAUDITED_PREFERENCES = ["project.visit"];

/** Procédures d'un groupe, sous-groupes compris (`spec.item.get`, TK-101) : `nom` pointé jusqu'à la procédure. */
function proceduresOf(prefix: string, node: Record<string, unknown>): [string, Procedure][] {
  return Object.entries(node).flatMap(([name, child]) =>
    "~orpc" in (child as object)
      ? [[`${prefix}.${name}`, child as Procedure] as [string, Procedure]]
      : proceduresOf(`${prefix}.${name}`, child as Record<string, unknown>),
  );
}

function nonGetProcedures(groupNames: readonly string[]): string[] {
  return groupNames.flatMap((group) =>
    proceduresOf(group, groups[group] ?? {})
      .filter(([, procedure]) => procedure["~orpc"].meta["~openapi"]?.method !== "GET")
      .map(([name]) => name)
      .filter((name) => !UNAUDITED_PREFERENCES.includes(name)),
  );
}

/** Tous les groupes à écriture : organization, member et project se journalisent aussi (audit_log ne requiert que organization_id). */
const WRITE_GROUPS = [
  "organization",
  "org",
  "invitation",
  "me",
  "member",
  "project",
  "projectClient",
  "suggestion",
  "review",
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
  "ai",
  "proposal",
  "aiProvider",
  "aiUsage",
  "aiSettings",
  "spec",
];
/**
 * Groupes dont les écritures sont journalisées et prouvées par une suite dédiée (`idea-audit.test.ts`, TK-89) : leurs
 * procédures sont imbriquées (`idea.page.*`), ce que l'énumération à deux niveaux ci-dessus ne parcourt pas.
 * `specMigration` (TK-106) : le lot enregistré est audité comme `specBatch.submit` (`spec.batch.submit`), prouvé par
 * `spec-migration.test.ts` (un audit à `start`, un de plus à `revert`, aucun sur un refus).
 */
const DEDICATED_AUDIT_GROUPS = ["idea", "specMigration"];
/** Groupes sans écriture à journaliser ici : lecture seule (H3). */
const READ_ONLY_GROUPS = ["audit", "clientSpace", "search", "aiModel"];
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
  "ai.ideaChat",
  "ai.ideaGaps",
  "ai.ideaSynthesis",
  "ai.prefillItem",
  "ai.proposeCriteria",
  "ai.proposeDeliverable",
  "ai.proposeFeatures",
  "ai.reviseProposal",
  "aiProvider.add",
  "aiProvider.remove",
  "aiProvider.replaceKey",
  "aiProvider.setPrimary",
  "aiProvider.verify",
  "aiSettings.update",
  "aiUsage.set",
  "comment.create",
  "comment.delete",
  "dependency.add",
  "dependency.remove",
  "installation.start",
  "invitation.create",
  "invitation.resend",
  "invitation.revoke",
  "lease.acquire",
  "lease.heartbeat",
  "lease.release",
  "llmCredential.invalidate",
  "llmCredential.remove",
  "llmCredential.set",
  "llmCredential.verify",
  "me.update",
  "me.updateNotification",
  "member.invite",
  "member.remove",
  "member.setRole",
  "member.updateRole",
  "org.update",
  "organization.create",
  "project.create",
  "project.retryRepo",
  "project.setEuOnly",
  "projectClient.add",
  "projectClient.remove",
  "projectState.update",
  "proposal.decide",
  "proposal.decideMany",
  "repo.createSpec",
  "repo.link",
  "review.remind",
  "review.submit",
  "spec.forceDeliverable",
  "specBatch.submit",
  "sprint.activate",
  "sprint.close",
  "sprint.create",
  "sprint.update",
  "suggestion.accept",
  "suggestion.create",
  "suggestion.reject",
  "suggestion.withdraw",
  "ticket.create",
  "ticket.delete",
  "ticket.transition",
  "ticket.update",
];

/**
 * Exception documentée (TK-98) : tester une clé avant de l'enregistrer consomme le quota `verify`, compté
 * par une ligne d'audit écrite AVANT l'appel (`llm_credential.verify`). `aiProvider.add` et `replaceKey`
 * produisent donc deux lignes (quota, puis écriture) ; elles sont vérifiées à part, plus bas.
 */
const TWO_ENTRY_PROCEDURES = ["aiProvider.add", "aiProvider.replaceKey"];

/** Groupes dont les écritures portent le projet explicite de la requête (`audit_log.project_id`, TK-96). */
const PILOTAGE_GROUPS = ["ticket", "dependency", "sprint", "comment", "projectState", "lease"];

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

const tickets = (ctx: Ctx, role: Role = "dev") =>
  apiFor(app, ctx.world.actors[role], ctx.world.projectId);
const collab = (ctx: Ctx, role: Role = "dev") =>
  collaborationFor(app, ctx.world.actors[role], ctx.world.projectId);
const comments = (ctx: Ctx, role: Role = "dev") =>
  commentsFor(app, ctx.world.actors[role], ctx.world.projectId);
const seed = (ctx: Ctx, over: Record<string, unknown> = {}) =>
  seedTicket(app, ctx.world.actors.dev, ctx.world.projectId, over);

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
    prepare: (ctx) => seedSprint(app, ctx.world.actors.dev, ctx.world.projectId),
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
    prepare: (ctx) => seedSprint(app, ctx.world.actors.dev, ctx.world.projectId),
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
      const sprint = await seedSprint(app, ctx.world.actors.dev, ctx.world.projectId);
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
    // TK-97 : la route d'écriture ajoutée garde l'action historique `member.setRole` (une action par fait).
    procedure: "member.updateRole",
    role: "owner",
    prepare: async () => ({}),
    call: (ctx) =>
      settingsApi(app, ctx.world.actors.owner).updateRole(
        ctx.world.actors.designer.memberId,
        "business",
      ),
    expected: async (ctx) => ({
      action: "member.setRole",
      targetKind: "member",
      targetId: ctx.world.actors.designer.memberId,
      ticketId: null,
    }),
    denied: (ctx) =>
      settingsApi(app, ctx.world.actors.owner).updateRole(ctx.world.actors.owner.memberId, "dev"),
    deniedStatuses: [409],
  },
  {
    procedure: "member.remove",
    role: "owner",
    prepare: async (ctx) => insertActor(database, ctx.world.organizationId, "dev", "a-retirer"),
    call: (ctx, member) => settingsApi(app, ctx.world.actors.owner).remove(member.memberId),
    expected: async (_ctx, member) => ({
      action: "member.remove",
      targetKind: "member",
      targetId: member.memberId,
      ticketId: null,
    }),
    denied: (ctx, member) => settingsApi(app, ctx.world.actors.dev).remove(member.memberId),
    deniedStatuses: [403],
  },
  {
    procedure: "org.update",
    role: "owner",
    prepare: async () => ({ slug: `audit-org-${Date.now()}` }),
    call: (ctx, state) =>
      settingsApi(app, ctx.world.actors.owner).orgUpdate({ name: "Nom audité", slug: state.slug }),
    expected: async (ctx) => ({
      action: "organization.update",
      targetKind: "organization",
      targetId: ctx.world.organizationId,
      ticketId: null,
    }),
    denied: (ctx, state) =>
      settingsApi(app, ctx.world.actors.dev).orgUpdate({ name: "Refusé", slug: state.slug }),
    deniedStatuses: [403],
  },
  {
    procedure: "invitation.create",
    role: "owner",
    prepare: async () => ({}),
    call: (ctx) =>
      settingsApi(app, ctx.world.actors.owner).invite({
        email: `inv-create-${Date.now()}@example.test`,
        role: "client",
        projectIds: [ctx.world.projectId],
      }),
    expected: async (_ctx, _s, res) => ({
      action: "member.invite",
      targetKind: "invitation",
      targetId: res.body.id,
      ticketId: null,
    }),
    denied: (ctx) =>
      settingsApi(app, ctx.world.actors.dev).invite({
        email: "refus-97@example.test",
        role: "dev",
      }),
    deniedStatuses: [403],
  },
  {
    procedure: "invitation.resend",
    role: "owner",
    prepare: async (ctx) =>
      (
        await settingsApi(app, ctx.world.actors.owner).invite({
          email: `inv-resend-${Date.now()}@example.test`,
          role: "dev",
        })
      ).body,
    call: (ctx, invitation) => settingsApi(app, ctx.world.actors.owner).resend(invitation.id),
    expected: async (_ctx, invitation) => ({
      action: "invitation.resend",
      targetKind: "invitation",
      targetId: invitation.id,
      ticketId: null,
    }),
    denied: (ctx, invitation) => settingsApi(app, ctx.world.actors.dev).resend(invitation.id),
    deniedStatuses: [403],
  },
  {
    procedure: "invitation.revoke",
    role: "owner",
    prepare: async (ctx) =>
      (
        await settingsApi(app, ctx.world.actors.owner).invite({
          email: `inv-revoke-${Date.now()}@example.test`,
          role: "dev",
        })
      ).body,
    call: (ctx, invitation) => settingsApi(app, ctx.world.actors.owner).revoke(invitation.id),
    expected: async (_ctx, invitation) => ({
      action: "invitation.revoke",
      targetKind: "invitation",
      targetId: invitation.id,
      ticketId: null,
    }),
    denied: (ctx, invitation) => settingsApi(app, ctx.world.actors.dev).revoke(invitation.id),
    deniedStatuses: [403],
  },
  {
    procedure: "me.update",
    role: "dev",
    prepare: async () => ({}),
    call: (ctx) => settingsApi(app, ctx.world.actors.dev).meUpdate({ name: "Nom audité" }),
    expected: async (ctx) => ({
      action: "me.update",
      targetKind: "user",
      targetId: ctx.world.actors.dev.userId,
      ticketId: null,
    }),
    denied: (ctx) => settingsApi(app, ctx.world.actors.dev).meUpdate({ name: "" }),
    deniedStatuses: [422],
  },
  {
    procedure: "me.updateNotification",
    role: "dev",
    prepare: async () => ({}),
    call: (ctx) => settingsApi(app, ctx.world.actors.dev).setNotification("weekly_digest", true),
    expected: async (ctx) => {
      const [row] = await database.query<{ id: string }>(
        "SELECT id FROM notification_preferences WHERE organization_id = $1 AND user_id = $2 AND key = 'weekly_digest'",
        [ctx.world.organizationId, ctx.world.actors.dev.userId],
      );
      return {
        action: "me.notifications.update",
        targetKind: "notification_preference",
        targetId: row?.id ?? "",
        ticketId: null,
      };
    },
    denied: (ctx) => settingsApi(app, ctx.world.actors.dev).setNotification("inconnue", true),
    deniedStatuses: [422],
  },
  {
    procedure: "projectClient.add",
    role: "owner",
    prepare: async () => ({}),
    call: (ctx) =>
      projectClientApi(app, ctx.world.actors.owner).add(
        ctx.world.projectId,
        ctx.world.actors.client.memberId,
      ),
    expected: async (ctx) => ({
      action: "project_client.add",
      targetKind: "project_client",
      targetId: (await linkRows(database, ctx.world.projectId))[0]?.id ?? "",
      ticketId: null,
    }),
    denied: (ctx) =>
      projectClientApi(app, ctx.world.actors.dev).add(
        ctx.world.projectId,
        ctx.world.actors.client.memberId,
      ),
    deniedStatuses: [403],
  },
  {
    procedure: "projectClient.remove",
    role: "owner",
    prepare: async (ctx) => {
      await projectClientApi(app, ctx.world.actors.owner).add(
        ctx.world.projectId,
        ctx.world.actors.client.memberId,
      );
      return { linkId: (await linkRows(database, ctx.world.projectId))[0]?.id ?? "" };
    },
    call: (ctx) =>
      projectClientApi(app, ctx.world.actors.owner).remove(
        ctx.world.projectId,
        ctx.world.actors.client.memberId,
      ),
    expected: async (_ctx, state) => ({
      action: "project_client.remove",
      targetKind: "project_client",
      targetId: state.linkId,
      ticketId: null,
    }),
    denied: (ctx) =>
      projectClientApi(app, ctx.world.actors.business).remove(
        ctx.world.projectId,
        ctx.world.actors.client.memberId,
      ),
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
    procedure: "project.retryRepo",
    role: "owner",
    prepare: async (ctx) => {
      const installation = await insertInstallation(database, ctx.world.organizationId);
      await database.query(
        `INSERT INTO project_creations (id, organization_id, project_id, status, error_code, repo_name, installation_id, idea_template, requested_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'failed', 'name_taken', 'projet-spec', $3, 'default', $4, now(), now())`,
        [
          ctx.world.organizationId,
          ctx.world.projectId,
          installation.id,
          ctx.world.actors.owner.userId,
        ],
      );
      return {};
    },
    call: (ctx) =>
      send(
        app,
        ctx.world.actors.owner.cookie,
        "post",
        `/projects/${ctx.world.projectId}/creation/retry`,
        {},
      ),
    expected: async (ctx) => ({
      action: "project.retry_repo",
      targetKind: "project",
      targetId: ctx.world.projectId,
      ticketId: null,
    }),
    denied: (ctx) =>
      send(
        app,
        ctx.world.actors.dev.cookie,
        "post",
        `/projects/${ctx.world.projectId}/creation/retry`,
        {},
      ),
    deniedStatuses: [403],
  },
  {
    procedure: "project.setEuOnly",
    role: "owner",
    prepare: async () => ({}),
    call: (ctx) =>
      send(
        app,
        ctx.world.actors.owner.cookie,
        "patch",
        `/projects/${ctx.world.projectId}/eu-only`,
        {
          euOnly: true,
        },
      ),
    expected: async (ctx) => ({
      action: "project.eu_only",
      targetKind: "project",
      targetId: ctx.world.projectId,
      ticketId: null,
    }),
    denied: (ctx) =>
      send(
        app,
        ctx.world.actors.designer.cookie,
        "patch",
        `/projects/${ctx.world.projectId}/eu-only`,
        {
          euOnly: true,
        },
      ),
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
  ...suggestionScenarios(),
  ...reviewScenarios(),
  ...aiScenarios(),
  ...proposalScenarios(),
  ...deliverableScenarios(),
  ...aiProviderScenarios(),
];

/** TK-100 : forcer l'ouverture d'un livrable, journalisé sur la ligne de forçage. */
function deliverableScenarios(): Scenario[] {
  const call = async (ctx: Ctx, role: Role) =>
    send(
      (await repoRuntimeOf()).app,
      ctx.world.actors[role].cookie,
      "post",
      `/projects/${ctx.world.projectId}/spec/deliverables/data/force`,
      { projectId: ctx.world.projectId, key: "data", confirm: true },
    );
  return [
    {
      procedure: "spec.forceDeliverable",
      role: "owner",
      prepare: async () => ({}),
      call: (ctx) => call(ctx, "owner"),
      expected: async (ctx) => {
        const [row] = await database.query<{ id: string }>(
          "SELECT id FROM deliverable_overrides WHERE project_id = $1 AND deliverable = 'data'",
          [ctx.world.projectId],
        );
        return {
          action: "deliverable.force",
          targetKind: "deliverable_override",
          targetId: row?.id ?? "",
          ticketId: null,
        };
      },
      denied: (ctx) => call(ctx, "dev"),
      deniedStatuses: [403],
    },
  ];
}

/**
 * TK-99a : lancement, révision et décisions sur les propositions de l'agent. Le lancement écrit sa ligne d'audit
 * (une par lancement) via le quota, la révision aussi ; chaque décision écrit la sienne dans sa transaction.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
function proposalScenarios(): Scenario[] {
  const appOf = async () => (await repoRuntimeOf()).app;
  const key = makeSentinel();
  const keyed = async (ctx: Ctx) => {
    await send(await appOf(), ctx.world.actors.owner.cookie, "put", "/llm-credentials/anthropic", {
      provider: "anthropic",
      apiKey: key,
    });
  };
  const scope = (ctx: Ctx) => ({
    organizationId: ctx.world.organizationId,
    projectId: ctx.world.projectId,
  });
  const as = async (
    ctx: Ctx,
    role: Role,
    method: "get" | "post",
    path: string,
    body?: Record<string, unknown>,
  ) => send(await appOf(), ctx.world.actors[role].cookie, method, path, body);
  const ofProposal = (action: string, targetKind: string, targetId: string): Expected => ({
    action,
    targetKind,
    targetId,
    ticketId: null,
  });
  return [
    {
      procedure: "ai.proposeDeliverable",
      role: "dev",
      prepare: async (ctx) => {
        await keyed(ctx);
        await freezeIdea(database, scope(ctx));
        return {};
      },
      call: (ctx) =>
        as(ctx, "dev", "post", PROPOSAL_ROUTES.propose(ctx.world.projectId), {
          projectId: ctx.world.projectId,
          deliverable: "functional",
          mode: "complete",
        }),
      expected: async (_ctx, _state, response) =>
        ofProposal("ai.deliverable.propose", "agent_launch", String(response.body.launchId)),
      denied: (ctx) =>
        as(ctx, "business", "post", PROPOSAL_ROUTES.propose(ctx.world.projectId), {
          projectId: ctx.world.projectId,
          deliverable: "functional",
          mode: "complete",
        }),
      deniedStatuses: [403],
    },
    {
      procedure: "ai.reviseProposal",
      role: "dev",
      prepare: async (ctx) => {
        await keyed(ctx);
        return insertProposal(database, scope(ctx));
      },
      call: (ctx, state) =>
        as(ctx, "dev", "post", PROPOSAL_ROUTES.revise(ctx.world.projectId, state.id), {
          projectId: ctx.world.projectId,
          proposalId: state.id,
          instruction: "Plus court",
        }),
      expected: async (_ctx, state) => ofProposal("ai.proposal.revise", "agent_proposal", state.id),
      denied: (ctx, state) =>
        as(ctx, "client", "post", PROPOSAL_ROUTES.revise(ctx.world.projectId, state.id), {
          projectId: ctx.world.projectId,
          proposalId: state.id,
          instruction: "Plus court",
        }),
      deniedStatuses: [403],
    },
    {
      procedure: "proposal.decide",
      role: "dev",
      prepare: (ctx) => insertProposal(database, scope(ctx)),
      call: (ctx, state) =>
        as(ctx, "dev", "post", PROPOSAL_ROUTES.decide(ctx.world.projectId, state.id), {
          projectId: ctx.world.projectId,
          proposalId: state.id,
          decision: "accept",
        }),
      expected: async (_ctx, state) => ofProposal("proposal.decide", "agent_proposal", state.id),
      denied: (ctx, state) =>
        as(ctx, "business", "post", PROPOSAL_ROUTES.decide(ctx.world.projectId, state.id), {
          projectId: ctx.world.projectId,
          proposalId: state.id,
          decision: "accept",
        }),
      deniedStatuses: [403],
    },
    {
      procedure: "proposal.decideMany",
      role: "dev",
      prepare: (ctx) => insertProposal(database, scope(ctx)),
      call: (ctx, state) =>
        as(ctx, "dev", "post", PROPOSAL_ROUTES.decideMany(ctx.world.projectId), {
          projectId: ctx.world.projectId,
          launchId: state.launchId,
          group: "all",
          decision: "accept",
          expectedPending: 1,
        }),
      expected: async (_ctx, state) =>
        ofProposal("proposal.decideMany", "agent_launch", state.launchId),
      denied: (ctx, state) =>
        as(ctx, "client", "post", PROPOSAL_ROUTES.decideMany(ctx.world.projectId), {
          projectId: ctx.world.projectId,
          launchId: state.launchId,
          group: "all",
          decision: "accept",
          expectedPending: 1,
        }),
      deniedStatuses: [403],
    },
  ];
}

/**
 * TK-54b : propositions IA et vérification de clé. Chaque appel (modèle simulé) produit exactement une
 * ligne d'audit, écrite avant l'appel, sans contenu : `ai.*` vise le projet, `verify` la ligne de la clé.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
function aiScenarios(): Scenario[] {
  const key = makeSentinel();
  const appOf = async () => (await repoRuntimeOf()).app;
  const putKey = async (ctx: Ctx) =>
    send(await appOf(), ctx.world.actors.owner.cookie, "put", "/llm-credentials/anthropic", {
      provider: "anthropic",
      apiKey: key,
    });
  const call = async (ctx: Ctx, role: Role, path: string, body: Record<string, unknown>) =>
    send(await appOf(), ctx.world.actors[role].cookie, "post", path, body);
  const onProject = (action: string) => async (ctx: Ctx) => ({
    action,
    targetKind: "project",
    targetId: ctx.world.projectId,
    ticketId: null,
  });
  const keyed = async (ctx: Ctx) => {
    await putKey(ctx);
    return {};
  };
  return [
    ...(["ideaChat", "ideaGaps", "ideaSynthesis"] as const).map((name): Scenario => {
      const segment = { ideaChat: "chat", ideaGaps: "gaps", ideaSynthesis: "synthesis" }[name];
      const action = {
        ideaChat: "ai.idea.chat",
        ideaGaps: "ai.idea.gaps",
        ideaSynthesis: "ai.idea.synthesis",
      }[name];
      const route = (projectId: string) => `/projects/${projectId}/ai/idea/${segment}`;
      const body = (projectId: string) =>
        name === "ideaChat" ? { projectId, mode: "free", text: "Bonjour" } : { projectId };
      return {
        procedure: `ai.${name}`,
        role: "dev",
        prepare: keyed,
        call: (ctx) => call(ctx, "dev", route(ctx.world.projectId), body(ctx.world.projectId)),
        expected: onProject(action),
        // TK-90 : le business lit l'espace Idée sans dialoguer avec l'agent (TK-91 : ni synthèse).
        denied: (ctx) =>
          call(ctx, "business", route(ctx.world.projectId), body(ctx.world.projectId)),
        deniedStatuses: [403],
      };
    }),
    {
      procedure: "ai.prefillItem",
      role: "dev",
      prepare: keyed,
      call: (ctx) => {
        const projectId = ctx.world.projectId;
        return call(ctx, "dev", `/projects/${projectId}/ai/item/prefill`, {
          projectId,
          type: "feature",
          description: "Annuler une réservation",
        });
      },
      expected: onProject("ai.item.prefill"),
      denied: (ctx) => {
        const projectId = ctx.world.projectId;
        return call(ctx, "business", `/projects/${projectId}/ai/item/prefill`, {
          projectId,
          type: "feature",
          description: "Annuler une réservation",
        });
      },
      deniedStatuses: [403],
    },
    {
      procedure: "ai.proposeFeatures",
      role: "dev",
      // 3.0.0 : l'agent lit le dossier figé, il en faut un.
      prepare: async (ctx) => {
        await freezeIdea(database, {
          organizationId: ctx.world.organizationId,
          projectId: ctx.world.projectId,
        });
        return keyed(ctx);
      },
      call: (ctx) => {
        const projectId = ctx.world.projectId;
        return call(ctx, "dev", AI_ROUTES.proposeFeatures(projectId), { projectId });
      },
      expected: onProject("ai.features.propose"),
      denied: (ctx) => {
        const projectId = ctx.world.projectId;
        return call(ctx, "business", AI_ROUTES.proposeFeatures(projectId), { projectId });
      },
      deniedStatuses: [403],
    },
    {
      procedure: "ai.proposeCriteria",
      role: "dev",
      prepare: async (ctx) => {
        const runtime = await repoRuntimeOf();
        const bench = {
          database,
          app: runtime.app,
          harness: runtime.harness,
        } as unknown as RepoBench;
        const scene = await readScene(bench, { world: ctx.world });
        await seedIndex(bench, scene, [{ id: "F-001", titre: "Connexion" }], { commit: true });
        return keyed(ctx);
      },
      call: (ctx) => {
        const projectId = ctx.world.projectId;
        return call(ctx, "dev", AI_ROUTES.proposeCriteria(projectId), {
          projectId,
          specId: "F-001",
        });
      },
      expected: onProject("ai.criteria.propose"),
      denied: (ctx) => {
        const projectId = ctx.world.projectId;
        return call(ctx, "client", AI_ROUTES.proposeCriteria(projectId), {
          projectId,
          specId: "F-001",
        });
      },
      deniedStatuses: [403],
    },
    {
      procedure: "llmCredential.verify",
      role: "owner",
      prepare: async (ctx) => {
        await putKey(ctx);
        return { id: (await credentialRows(database, ctx.world.organizationId))[0]?.id ?? "" };
      },
      call: (ctx) => call(ctx, "owner", AI_ROUTES.verify(), { provider: "anthropic" }),
      expected: async (_ctx, state) => ({
        action: "llm_credential.verify",
        targetKind: "llm_credential",
        targetId: state.id,
        ticketId: null,
      }),
      denied: (ctx) => call(ctx, "dev", AI_ROUTES.verify(), { provider: "anthropic" }),
      deniedStatuses: [403],
    },
  ];
}

/**
 * TK-98 : écran des fournisseurs. Le modèle simulé répond à toute finalité ; la clé est une sentinelle
 * factice. Le deuxième fournisseur reçoit un modèle saisi (le catalogue de lancement n'en qualifie qu'un).
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
function aiProviderScenarios(): Scenario[] {
  const key = makeSentinel();
  const appOf = async () => (await repoRuntimeOf()).app;
  const as = async (
    ctx: Ctx,
    role: Role,
    method: "post" | "put" | "patch" | "delete",
    path: string,
    body?: Record<string, unknown>,
  ) => send(await appOf(), ctx.world.actors[role].cookie, method, path, body);
  const addAll = async (ctx: Ctx, providers: string[]) => {
    for (const provider of providers) {
      await as(ctx, "owner", "post", "/ai/providers", {
        provider,
        apiKey: key,
        ...(provider === "anthropic" ? {} : { model: "mon-modele" }),
      });
    }
    const rows = await credentialRows(database, ctx.world.organizationId);
    return Object.fromEntries(rows.map((row) => [row.provider, row.id]));
  };
  const onCredential = (action: string, provider: string) => async (_ctx: Ctx, ids: State) => ({
    action,
    targetKind: "llm_credential",
    targetId: ids[provider],
    ticketId: null,
  });
  const onOrganization = (action: string) => async (ctx: Ctx) => ({
    action,
    targetKind: "organization",
    targetId: ctx.world.organizationId,
    ticketId: null,
  });
  return [
    {
      procedure: "aiProvider.verify",
      role: "owner",
      prepare: (ctx) => addAll(ctx, ["anthropic"]),
      call: (ctx) =>
        as(ctx, "owner", "post", "/ai/providers/anthropic/verify", { provider: "anthropic" }),
      expected: onCredential("llm_credential.verify", "anthropic"),
      denied: (ctx) =>
        as(ctx, "dev", "post", "/ai/providers/anthropic/verify", { provider: "anthropic" }),
      deniedStatuses: [403],
    },
    {
      procedure: "aiProvider.remove",
      role: "owner",
      prepare: (ctx) => addAll(ctx, ["anthropic", "openai"]),
      call: (ctx) => as(ctx, "owner", "delete", "/ai/providers/openai"),
      expected: onCredential("ai_provider.remove", "openai"),
      denied: (ctx) => as(ctx, "dev", "delete", "/ai/providers/openai"),
      deniedStatuses: [403],
    },
    {
      procedure: "aiProvider.setPrimary",
      role: "owner",
      prepare: (ctx) => addAll(ctx, ["anthropic", "openai"]),
      call: (ctx) =>
        as(ctx, "owner", "post", "/ai/providers/openai/primary", { provider: "openai" }),
      expected: onOrganization("ai_provider.setPrimary"),
      denied: (ctx) =>
        as(ctx, "owner", "post", "/ai/providers/google/primary", { provider: "google" }),
      deniedStatuses: [404],
    },
    {
      procedure: "aiUsage.set",
      role: "owner",
      prepare: (ctx) => addAll(ctx, ["anthropic"]),
      call: (ctx) =>
        as(ctx, "owner", "put", "/ai/usages/idea_space", { usage: "idea_space", model: null }),
      expected: onOrganization("ai_settings.update"),
      denied: (ctx) =>
        as(ctx, "dev", "put", "/ai/usages/idea_space", { usage: "idea_space", model: null }),
      deniedStatuses: [403],
    },
    {
      procedure: "aiSettings.update",
      role: "owner",
      prepare: (ctx) => addAll(ctx, ["anthropic"]),
      call: (ctx) => as(ctx, "owner", "patch", "/ai/settings", { fallbackEnabled: false }),
      expected: onOrganization("ai_settings.update"),
      denied: (ctx) => as(ctx, "owner", "patch", "/ai/settings", { monthlyCapMicroUsd: 0 }),
      deniedStatuses: [422],
    },
  ];
}

describe("exception documentée : aiProvider.add et replaceKey écrivent le quota puis l'ajout", () => {
  const send2 = async (
    ctx: { world: World },
    method: "post" | "put",
    path: string,
    body: Record<string, unknown>,
  ) => send((await repoRuntimeOf()).app, ctx.world.actors.owner.cookie, method, path, body);

  it("add : llm_credential.verify (organisation) puis ai_provider.add (ligne de la clé), deux entrées exactement", async () => {
    const ctx = { world: await createWorld(database, { linkedClient: false }) };
    const before = await auditRowsFull(database, ctx.world.organizationId);

    const res = await send2(ctx, "post", "/ai/providers", {
      provider: "anthropic",
      apiKey: makeSentinel(),
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const created = (await auditRowsFull(database, ctx.world.organizationId)).slice(before.length);
    const [row] = await credentialRows(database, ctx.world.organizationId);
    expect(created.map((r) => [r.action, r.target_kind, r.target_id])).toEqual([
      ["llm_credential.verify", "organization", ctx.world.organizationId],
      ["ai_provider.add", "llm_credential", row?.id],
    ]);
    expect(created.every((r) => r.actor_id === ctx.world.actors.owner.userId)).toBe(true);
  });

  it("replaceKey : mêmes deux entrées, la seconde sur la même ligne de clé", async () => {
    const ctx = { world: await createWorld(database, { linkedClient: false }) };
    await send2(ctx, "post", "/ai/providers", { provider: "anthropic", apiKey: makeSentinel() });
    const before = await auditRowsFull(database, ctx.world.organizationId);

    const res = await send2(ctx, "put", "/ai/providers/anthropic/key", {
      provider: "anthropic",
      apiKey: makeSentinel(),
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const created = (await auditRowsFull(database, ctx.world.organizationId)).slice(before.length);
    const [row] = await credentialRows(database, ctx.world.organizationId);
    expect(created.map((r) => [r.action, r.target_kind, r.target_id])).toEqual([
      ["llm_credential.verify", "organization", ctx.world.organizationId],
      ["ai_provider.replaceKey", "llm_credential", row?.id],
    ]);
  });
});

/**
 * TK-52b : clés BYOK. Application avec porte-clés (celle du banc `repo`) ; la clé est une sentinelle
 * factice construite à l'exécution. La cible de l'audit est l'id de la ligne.
 */
const LLM_KEY = makeSentinel();
const llmPath = (suffix = "") => `/llm-credentials/anthropic${suffix}`;

/**
 * TK-55c : suggestions. Cible `project` (aucune spec indexée requise). La cible de l'audit est l'id de
 * la ligne ; aucun contenu libre n'est journalisé.
 */
function suggestionScenarios(): Scenario[] {
  const as = (ctx: Ctx, role: Role) => suggestionApi(app, ctx.world.actors[role]);
  const open = async (ctx: Ctx) => {
    const created = await as(ctx, "dev").create(ctx.world.projectId);
    return { id: created.body.id as string };
  };
  const expected = (action: string) => async (_ctx: Ctx, state: State, res: Response) => ({
    action,
    targetKind: "suggestion",
    targetId: state?.id ?? res.body.id,
    ticketId: null,
  });
  return [
    {
      procedure: "suggestion.create",
      role: "dev",
      prepare: async () => ({}),
      call: (ctx) => as(ctx, "dev").create(ctx.world.projectId),
      expected: expected("suggestion.create"),
      denied: (ctx) => as(ctx, "business").create(ctx.world.projectId),
      deniedStatuses: [403],
    },
    {
      procedure: "suggestion.withdraw",
      role: "dev",
      prepare: open,
      call: (ctx, state) => as(ctx, "dev").withdraw(ctx.world.projectId, state.id),
      expected: expected("suggestion.withdraw"),
      denied: (ctx, state) => as(ctx, "business").withdraw(ctx.world.projectId, state.id),
      deniedStatuses: [403],
    },
    {
      procedure: "suggestion.accept",
      role: "owner",
      prepare: open,
      call: (ctx, state) => as(ctx, "owner").accept(ctx.world.projectId, state.id),
      expected: expected("suggestion.accept"),
      denied: (ctx, state) => as(ctx, "designer").accept(ctx.world.projectId, state.id),
      deniedStatuses: [403],
    },
    {
      procedure: "suggestion.reject",
      role: "owner",
      prepare: open,
      call: (ctx, state) => as(ctx, "owner").reject(ctx.world.projectId, state.id),
      expected: expected("suggestion.reject"),
      denied: (ctx, state) => as(ctx, "client").reject(ctx.world.projectId, state.id),
      deniedStatuses: [403],
    },
  ];
}

/**
 * TK-55d : validation d'une feature par le client lié (spec indexée et committée dans le faux
 * fournisseur du banc `repo`). La cible de l'audit est l'id de la review ; ni SHA ni commentaire.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
function reviewScenarios(): Scenario[] {
  const prepare = async (ctx: Ctx) => {
    const runtime = await repoRuntimeOf();
    const bench = { database, app: runtime.app, harness: runtime.harness } as unknown as RepoBench;
    const scene = await readScene(bench, { world: ctx.world });
    await linkClient(
      database,
      ctx.world.organizationId,
      ctx.world.projectId,
      ctx.world.actors.client.userId,
    );
    const { sha } = await seedIndex(bench, scene, [{ id: "F-001", titre: "Connexion" }], {
      commit: true,
    });
    return { sha };
  };
  return [
    {
      procedure: "review.submit",
      role: "client",
      prepare,
      call: async (ctx, state) =>
        reviewApi((await repoRuntimeOf()).app, ctx.world.actors.client).submit(
          ctx.world.projectId,
          state.sha,
        ),
      expected: async (_ctx, _state, res) => ({
        action: "review.approve",
        targetKind: "review",
        targetId: res.body.id,
        ticketId: null,
      }),
      denied: async (ctx, state) =>
        reviewApi((await repoRuntimeOf()).app, ctx.world.actors.owner).submit(
          ctx.world.projectId,
          state.sha,
        ),
      deniedStatuses: [403],
    },
    {
      // TK-104 (B352) : relance du client ; l'audit cible le lien d'accès du client relancé, rien de libre.
      procedure: "review.remind",
      role: "owner",
      prepare,
      call: async (ctx) =>
        reviewApi((await repoRuntimeOf()).app, ctx.world.actors.owner).remind(ctx.world.projectId),
      expected: async (ctx) => {
        const [link] = await database.query<{ id: string }>(
          "SELECT id FROM project_client_access WHERE project_id = $1",
          [ctx.world.projectId],
        );
        return {
          action: "review.remind",
          targetKind: "project_client",
          targetId: link?.id ?? "",
          ticketId: null,
        };
      },
      denied: async (ctx) =>
        reviewApi((await repoRuntimeOf()).app, ctx.world.actors.dev).remind(ctx.world.projectId),
      deniedStatuses: [403],
    },
  ];
}

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

describe("écritures hors journal (TK-88)", () => {
  it("la seule est la préférence project.visit, qui existe bel et bien", () => {
    expect(UNAUDITED_PREFERENCES).toEqual(["project.visit"]);
    expect(groups.project?.visit?.["~orpc"].meta["~openapi"]?.method).toBe("POST");
  });
});

describe("garde de complétude : le contrat dicte les scénarios", () => {
  it("les procédures non-GET des groupes sont exactement celles attendues", () => {
    expect(nonGetProcedures(WRITE_GROUPS).sort()).toEqual(EXPECTED_WRITE_PROCEDURES);
  });

  it("chaque procédure d'écriture du contrat a un scénario", () => {
    const covered = new Set([...SCENARIOS.map((s) => s.procedure), ...TWO_ENTRY_PROCEDURES]);
    const missing = nonGetProcedures(WRITE_GROUPS).filter((name) => !covered.has(name));
    expect(missing, `procédures d'écriture sans scénario d'audit : ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("aucun scénario ne vise une procédure disparue ou non-écriture", () => {
    const writes = new Set(nonGetProcedures(WRITE_GROUPS));
    const stale = [...SCENARIOS.map((s) => s.procedure), ...TWO_ENTRY_PROCEDURES].filter(
      (name) => !writes.has(name),
    );
    expect(stale).toEqual([]);
  });

  it("chaque groupe du contrat est couvert ou en lecture seule : aucune exclusion", () => {
    const known = new Set([
      ...WRITE_GROUPS,
      ...DEDICATED_AUDIT_GROUPS,
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

describe("garde TK-54b : le groupe ai", () => {
  it("est implémenté par l'API (la garde ne couvre pas du vide)", () => {
    const sources = apiSourceFiles().map((file) => stripComments(readFileSync(file, "utf8")));
    expect(sources.some((source) => referencesGroup(source, "ai"))).toBe(true);
  });
});

describe("garde TK-55a : le groupe projectClient", () => {
  it("est implémenté par l'API (la garde ne couvre pas du vide)", () => {
    const sources = apiSourceFiles().map((file) => stripComments(readFileSync(file, "utf8")));
    expect(sources.some((source) => referencesGroup(source, "projectClient"))).toBe(true);
  });

  it("projectClient.list est une lecture : hors des écritures à journaliser", () => {
    expect(nonGetProcedures(["projectClient"]).sort()).toEqual([
      "projectClient.add",
      "projectClient.remove",
    ]);
  });
});

describe("garde TK-55c : le groupe suggestion", () => {
  it("est implémenté par l'API (la garde ne couvre pas du vide)", () => {
    const sources = apiSourceFiles().map((file) => stripComments(readFileSync(file, "utf8")));
    expect(sources.some((source) => referencesGroup(source, "suggestion"))).toBe(true);
  });

  it("suggestion.list est une lecture : hors des écritures à journaliser", () => {
    expect(nonGetProcedures(["suggestion"]).sort()).toEqual([
      "suggestion.accept",
      "suggestion.create",
      "suggestion.reject",
      "suggestion.withdraw",
    ]);
  });
});

describe("garde TK-55d : le groupe review", () => {
  it("est implémenté par l'API (la garde ne couvre pas du vide)", () => {
    const sources = apiSourceFiles().map((file) => stripComments(readFileSync(file, "utf8")));
    expect(sources.some((source) => referencesGroup(source, "review"))).toBe(true);
  });

  it("review.list est une lecture : seules review.remind (TK-104) et review.submit sont à journaliser", () => {
    expect(nonGetProcedures(["review"]).sort()).toEqual(["review.remind", "review.submit"]);
  });
});

describe("garde TK-52b : le groupe llmCredential", () => {
  it("est implémenté par l'API (la garde ne couvre pas du vide)", () => {
    const sources = apiSourceFiles().map((file) => stripComments(readFileSync(file, "utf8")));
    expect(sources.some((source) => referencesGroup(source, "llmCredential"))).toBe(true);
  });
});

async function checkSuccess(scenario: Scenario) {
  const ctx = { world: await createWorld(database, { linkedClient: false }) };
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
  // TK-96 (C7) : une écriture de pilotage journalise le projet fourni par la requête.
  if (PILOTAGE_GROUPS.includes(scenario.procedure.split(".")[0] ?? "")) {
    expect(row?.project_id).toBe(ctx.world.projectId);
  }
  const last = before.at(-1);
  if (last && row) {
    expect(row.occurred_at.getTime()).toBeGreaterThanOrEqual(last.occurred_at.getTime());
  }
}

async function checkListed(scenario: Scenario) {
  const ctx = { world: await createWorld(database, { linkedClient: false }) };
  const state = await scenario.prepare(ctx);
  const response = await scenario.call(ctx, state);
  expect(response.status).toBe(200);
  const expected = await scenario.expected(ctx, state, response);

  const listed = await commentsFor(app, ctx.world.actors.owner, ctx.world.projectId).listAudit(
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
  const ctx = { world: await createWorld(database, { linkedClient: false }) };
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
    const ctx = { world: await createWorld(database, { linkedClient: false }) };
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
