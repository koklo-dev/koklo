import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_LIMIT_DEFAULTS, AI_WINDOW_SECONDS } from "../src/ai/ai-budget.ts";
import {
  AI_ACTIONS,
  aiApi,
  aiAuditRows,
  BRIEF_REPLY,
  GatedLlm,
  insertAuditAt,
  installAiBench,
  keyedWorld,
} from "./helpers/ai-bench.ts";
import { createWorld } from "./helpers/tickets.ts";

/**
 * TK-54b, D8 : quotas par organisation et par utilisateur calculés sur les lignes d'audit (aucun
 * état en mémoire : valable à plusieurs instances), quota de `verify`, sémaphore de concurrence.
 * Refus : 429 `LLM_RATE_LIMITED { retryAfterSeconds }`, sans appel au modèle ni nouvelle ligne.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
const HOUR = AI_WINDOW_SECONDS * 1000;

describe("valeurs par défaut (D8, à valider par l'humain)", () => {
  it("30 appels par heure et organisation, 10 par utilisateur, 5 verify, 2 appels simultanés", () => {
    expect(AI_LIMIT_DEFAULTS).toEqual({
      maxCallsPerHourOrg: 30,
      maxCallsPerHourUser: 10,
      maxVerifyPerHourOrg: 5,
      maxConcurrentPerOrg: 2,
    });
    expect(AI_WINDOW_SECONDS).toBe(3600);
  });

  it("une application sans réglage applique ces défauts", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    const defaults = await b.makeApp({ limits: { ...AI_LIMIT_DEFAULTS } });
    const api = aiApi(defaults, world.actors.dev);

    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await api.draftBrief(world.projectId)).status);

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("quota par utilisateur et par organisation", () => {
  it("le (N+1)-ième appel d'un utilisateur : 429 + retryAfterSeconds, sans appel ni ligne d'audit en plus", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxCallsPerHourUser: 2, maxCallsPerHourOrg: 100 } });
    const { world } = await keyedWorld(b);
    const fake = FakeLlm.replying(BRIEF_REPLY);
    b.use(fake);
    const api = aiApi(app, world.actors.dev);

    expect((await api.draftBrief(world.projectId)).status).toBe(200);
    expect((await api.draftBrief(world.projectId)).status).toBe(200);
    const refused = await api.draftBrief(world.projectId);

    expect(refused.status, JSON.stringify(refused.body)).toBe(429);
    expect(refused.body.code).toBe("LLM_RATE_LIMITED");
    expect(refused.body.data.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(refused.body.data.retryAfterSeconds).toBeLessThanOrEqual(AI_WINDOW_SECONDS);
    expect(fake.calls).toHaveLength(2);
    expect(await aiAuditRows(b.database, world.organizationId)).toHaveLength(2);
  });

  it("les trois procédures ai.* partagent le même quota ; un autre utilisateur de l'organisation reste servi", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxCallsPerHourUser: 2, maxCallsPerHourOrg: 100 } });
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    const dev = aiApi(app, world.actors.dev);
    const admin = aiApi(app, world.actors.admin);

    await dev.draftBrief(world.projectId);
    await dev.proposeFeatures(world.projectId);
    const refused = await dev.proposeCriteria(world.projectId);
    const other = await admin.draftBrief(world.projectId);

    expect(refused.status).toBe(429);
    expect(other.status, JSON.stringify(other.body)).toBe(200);
  });

  it("le quota de l'organisation s'applique à tous ses utilisateurs ensemble", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxCallsPerHourUser: 100, maxCallsPerHourOrg: 3 } });
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));

    const statuses = [
      (await aiApi(app, world.actors.dev).draftBrief(world.projectId)).status,
      (await aiApi(app, world.actors.admin).draftBrief(world.projectId)).status,
      (await aiApi(app, world.actors.designer).draftBrief(world.projectId)).status,
      (await aiApi(app, world.actors.owner).draftBrief(world.projectId)).status,
    ];

    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("une autre organisation n'est pas affectée par le quota de la première", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxCallsPerHourUser: 1, maxCallsPerHourOrg: 1 } });
    const first = await keyedWorld(b);
    const second = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));

    expect(
      (await aiApi(app, first.world.actors.dev).draftBrief(first.world.projectId)).status,
    ).toBe(200);
    expect(
      (await aiApi(app, first.world.actors.dev).draftBrief(first.world.projectId)).status,
    ).toBe(429);
    expect(
      (await aiApi(app, second.world.actors.dev).draftBrief(second.world.projectId)).status,
    ).toBe(200);
  });

  it("sans état en mémoire : une seconde instance sur la même base voit les appels de la première", async () => {
    const b = bench();
    const limits = { maxCallsPerHourUser: 2, maxCallsPerHourOrg: 2 };
    const one = await b.makeApp({ limits });
    const two = await b.makeApp({ limits });
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));

    expect((await aiApi(one, world.actors.dev).draftBrief(world.projectId)).status).toBe(200);
    expect((await aiApi(two, world.actors.dev).draftBrief(world.projectId)).status).toBe(200);
    expect((await aiApi(one, world.actors.dev).draftBrief(world.projectId)).status).toBe(429);
    expect((await aiApi(two, world.actors.dev).draftBrief(world.projectId)).status).toBe(429);
  });

  it("fenêtre glissante : les lignes de plus d'une heure ne comptent pas, celles de la fenêtre comptent", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxCallsPerHourUser: 2, maxCallsPerHourOrg: 100 } });
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    const user = world.actors.dev.userId;
    const old = {
      organizationId: world.organizationId,
      userId: user,
      action: AI_ACTIONS.draftBrief,
      targetKind: "project" as const,
      targetId: world.projectId,
    };
    await insertAuditAt(b.database, { ...old, at: new Date(Date.now() - 2 * HOUR) });
    await insertAuditAt(b.database, { ...old, at: new Date(Date.now() - 3 * HOUR) });
    const api = aiApi(app, world.actors.dev);

    expect((await api.draftBrief(world.projectId)).status).toBe(200);

    await insertAuditAt(b.database, { ...old, at: new Date(Date.now() - 10 * 60 * 1000) });
    const refused = await api.draftBrief(world.projectId);
    expect(refused.status).toBe(429);
    // La plus ancienne ligne de la fenêtre (il y a 10 minutes) sort dans ~50 minutes.
    expect(refused.body.data.retryAfterSeconds).toBeGreaterThan(2800);
    expect(refused.body.data.retryAfterSeconds).toBeLessThanOrEqual(3000);
  });

  it("les lignes d'autres actions (ticket.create, verify) ne comptent pas dans le quota ai.*", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxCallsPerHourUser: 1, maxCallsPerHourOrg: 1 } });
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    await insertAuditAt(b.database, {
      organizationId: world.organizationId,
      userId: world.actors.dev.userId,
      action: "llm_credential.verify",
      targetKind: "llm_credential",
      targetId: world.projectId,
      at: new Date(),
    });

    const res = await aiApi(app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("un appel refusé par la clé absente ou par la garde de rôle ne consomme pas de quota", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxCallsPerHourUser: 1, maxCallsPerHourOrg: 1 } });
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    await aiApi(app, world.actors.client).draftBrief(world.projectId);
    const bare = await createWorld(b.database);
    await aiApi(app, bare.actors.dev).draftBrief(bare.projectId);

    expect((await aiApi(app, world.actors.dev).draftBrief(world.projectId)).status).toBe(200);
    expect(await aiAuditRows(b.database, bare.organizationId)).toEqual([]);
  });
});

describe("quota de llmCredential.verify", () => {
  it("N verify par heure et par organisation, compté à part des appels ai.*", async () => {
    const b = bench();
    const app = await b.makeApp({
      limits: { maxVerifyPerHourOrg: 2, maxCallsPerHourOrg: 1, maxCallsPerHourUser: 1 },
    });
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying("OK"));
    const owner = aiApi(app, world.actors.owner);
    const admin = aiApi(app, world.actors.admin);

    expect((await owner.verify()).status).toBe(200);
    expect((await admin.verify()).status).toBe(200);
    const refused = await owner.verify();
    b.use(FakeLlm.replying(BRIEF_REPLY));
    const aiCall = await aiApi(app, world.actors.dev).draftBrief(world.projectId);

    expect(refused.status, JSON.stringify(refused.body)).toBe(429);
    expect(refused.body.code).toBe("LLM_RATE_LIMITED");
    expect(refused.body.data.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(aiCall.status).toBe(200);
    expect(await aiAuditRows(b.database, world.organizationId)).toHaveLength(3);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("concurrence : sémaphore par organisation", () => {
  it("au plus maxConcurrentPerOrg appels simultanés ; le suivant est refusé tout de suite (429), puis la place se libère", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxConcurrentPerOrg: 2 } });
    const { world } = await keyedWorld(b);
    const gated = new GatedLlm(FakeLlm.replying(BRIEF_REPLY));
    b.use(gated);
    const api = aiApi(app, world.actors.dev);

    const first = api.draftBrief(world.projectId).then((res) => res);
    const second = api.draftBrief(world.projectId).then((res) => res);
    await gated.untilStarted(2);
    const third = await api.draftBrief(world.projectId);

    expect(third.status, JSON.stringify(third.body)).toBe(429);
    expect(third.body.code).toBe("LLM_RATE_LIMITED");
    expect(third.body.data.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(gated.started).toBe(2);

    gated.release();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect((await api.draftBrief(world.projectId)).status).toBe(200);
  });

  it("la place est rendue même quand le fournisseur échoue", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxConcurrentPerOrg: 1 } });
    const { world } = await keyedWorld(b);
    const { LlmProviderUnavailableError } = await import("@koklo/domain");
    b.use(FakeLlm.failing(new LlmProviderUnavailableError({ operation: "complete" })));
    const api = aiApi(app, world.actors.dev);

    for (let i = 0; i < 3; i += 1) {
      expect((await api.draftBrief(world.projectId)).status).toBe(502);
    }
    b.use(FakeLlm.replying(BRIEF_REPLY));
    expect((await api.draftBrief(world.projectId)).status).toBe(200);
  });

  it("la place est rendue quand la sortie est invalide, ou quand une erreur inattendue est levée", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxConcurrentPerOrg: 1 } });
    const { world } = await keyedWorld(b);
    const api = aiApi(app, world.actors.dev);

    b.use(FakeLlm.replying({ pas: "un brief" }));
    expect((await api.draftBrief(world.projectId)).status).toBe(502);
    b.use({ id: "fake", complete: () => Promise.reject(new Error("panne inattendue")) });
    expect((await api.draftBrief(world.projectId)).status).toBe(502);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    expect((await api.draftBrief(world.projectId)).status).toBe(200);
  });

  it("une autre organisation n'est pas bloquée par la saturation de la première", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxConcurrentPerOrg: 1 } });
    const busy = await keyedWorld(b);
    const free = await keyedWorld(b);
    const gated = new GatedLlm(FakeLlm.replying(BRIEF_REPLY));
    b.use(gated);

    const stuck = aiApi(app, busy.world.actors.dev)
      .draftBrief(busy.world.projectId)
      .then((res) => res);
    await gated.untilStarted(1);
    const other = aiApi(app, free.world.actors.dev)
      .draftBrief(free.world.projectId)
      .then((res) => res);
    await gated.untilStarted(2);

    expect(gated.started).toBe(2);
    gated.release();
    expect((await stuck).status).toBe(200);
    expect((await other).status).toBe(200);
  });

  it("un refus par le sémaphore n'écrit pas de ligne d'audit", async () => {
    const b = bench();
    const app = await b.makeApp({ limits: { maxConcurrentPerOrg: 1 } });
    const { world } = await keyedWorld(b);
    const gated = new GatedLlm(FakeLlm.replying(BRIEF_REPLY));
    b.use(gated);
    const api = aiApi(app, world.actors.dev);

    const running = api.draftBrief(world.projectId).then((res) => res);
    await gated.untilStarted(1);
    const refused = await api.draftBrief(world.projectId);
    gated.release();
    await running;

    expect(refused.status).toBe(429);
    expect(await aiAuditRows(b.database, world.organizationId)).toHaveLength(1);
  });
});
