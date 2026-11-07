import type { Role } from "@koklo/contract";
import { FakeLlm } from "@koklo/domain/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_ROUTES, installAiBench } from "./helpers/ai-bench.ts";
import { providersApi, ROUTE_CALLS, sealedRows, settingsRows } from "./helpers/ai-providers.ts";
import { auditRowsFull } from "./helpers/comments.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";
import { createWorld } from "./helpers/tickets.ts";

/**
 * TK-98 lot A, cas 10 : droits vérifiés côté serveur. Owner et admin seulement, lectures comprises ;
 * dev, designer, business et client reçoivent 403 avant toute validation ou recherche, sans effet ;
 * sans session 401 ; une origine étrangère ne peut écrire ; une clé d'une autre organisation est introuvable.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
const secret = makeSentinel();
const ALLOWED: Role[] = ["owner", "admin"];
const DENIED: Role[] = ["dev", "designer", "client", "business"];
const NAMES = Object.keys(ROUTE_CALLS);
const FOREIGN = "https://evil.example";

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("aiProvider, aiModel, aiUsage, aiSettings : rôles", () => {
  it("onze routes couvertes", () => expect(NAMES).toHaveLength(11));

  it.each(NAMES.flatMap((name) => ALLOWED.map((role) => [name, role] as const)))(
    "%s : %s est admis (200 ou refus métier 422)",
    async (name, role) => {
      const b = bench();
      const world = await createWorld(b.database);
      b.use(FakeLlm.replying("OK"));
      await providersApi(b.app, world.actors.owner).add({
        provider: "anthropic",
        apiKey: makeSentinel(),
      });
      const call = ROUTE_CALLS[name];
      const res = await call?.(providersApi(b.app, world.actors[role]), secret);
      expect([200, 422], `${name} ${role} : ${res?.text}`).toContain(res?.status);
    },
  );

  it.each(NAMES.flatMap((name) => DENIED.map((role) => [name, role] as const)))(
    "%s : %s reçoit 403 FORBIDDEN, sans aucun effet",
    async (name, role) => {
      const b = bench();
      const world = await createWorld(b.database);
      b.use(FakeLlm.replying("OK"));
      await providersApi(b.app, world.actors.owner).add({
        provider: "anthropic",
        apiKey: makeSentinel(),
      });
      const rows = await sealedRows(b.database, world.organizationId);
      const settings = await settingsRows(b.database, world.organizationId);
      const audit = await auditRowsFull(b.database, world.organizationId);
      const fake = FakeLlm.replying("OK");
      b.use(fake);

      const res = await ROUTE_CALLS[name]?.(providersApi(b.app, world.actors[role]), secret);

      expect(res?.status).toBe(403);
      expect(res?.body.code).toBe("FORBIDDEN");
      expect(res?.text).not.toContain(secret);
      expect(fake.calls).toHaveLength(0);
      expect(await sealedRows(b.database, world.organizationId)).toEqual(rows);
      expect(await settingsRows(b.database, world.organizationId)).toEqual(settings);
      expect(await auditRowsFull(b.database, world.organizationId)).toEqual(audit);
    },
  );

  it.each(NAMES)("%s : sans session 401 UNAUTHORIZED", async (name) => {
    const res = await ROUTE_CALLS[name]?.(providersApi(bench().app, undefined), secret);
    expect(res?.status).toBe(401);
    expect(res?.body.code).toBe("UNAUTHORIZED");
  });

  it.each(DENIED)(
    "%s : entrée invalide ou cible absente, toujours 403 (jamais 422 ni 404)",
    async (role) => {
      const b = bench();
      const world = await createWorld(b.database);
      const api = providersApi(b.app, world.actors[role]);
      expect((await api.add({ provider: "fake", apiKey: "" })).status).toBe(403);
      expect((await api.remove("google")).status).toBe(403);
      expect((await api.setUsage("inconnu", { model: "x" })).status).toBe(403);
      expect((await api.update({ monthlyCapMicroUsd: -1 })).status).toBe(403);
      expect((await api.report("?month=zzz")).status).toBe(403);
    },
  );
});

describe("origine étrangère : écritures refusées, rien d'écrit", () => {
  const WRITES: [string, "post" | "put" | "patch" | "delete", string, Record<string, unknown>][] = [
    ["add", "post", "/ai/providers", { provider: "anthropic", apiKey: secret }],
    ["verify", "post", "/ai/providers/anthropic/verify", { provider: "anthropic" }],
    ["replaceKey", "put", "/ai/providers/anthropic/key", { provider: "anthropic", apiKey: secret }],
    ["remove", "delete", "/ai/providers/anthropic", {}],
    ["setPrimary", "post", "/ai/providers/anthropic/primary", { provider: "anthropic" }],
    ["setUsage", "put", "/ai/usages/idea_space", { usage: "idea_space", model: null }],
    ["update", "patch", "/ai/settings", { fallbackEnabled: false }],
  ];

  it.each(WRITES)("%s : Origin étranger, 403 et aucun effet", async (_name, method, path, body) => {
    const b = bench();
    const world = await createWorld(b.database);
    const fake = FakeLlm.replying("OK");
    b.use(fake);
    const res = await request(b.app.getHttpServer())
      [method](path)
      .set("Cookie", world.actors.owner.cookie)
      .set("Origin", FOREIGN)
      .send(body);
    expect(res.status, res.text).toBe(403);
    expect(res.text).not.toContain("evil.example");
    expect(fake.calls).toHaveLength(0);
    expect(await sealedRows(b.database, world.organizationId)).toEqual([]);
    expect(await settingsRows(b.database, world.organizationId)).toEqual([]);
  });

  it("une lecture (GET) n'est pas soumise au contrôle d'origine", async () => {
    const b = bench();
    const world = await createWorld(b.database);
    const res = await request(b.app.getHttpServer())
      .get("/ai/providers")
      .set("Cookie", world.actors.owner.cookie)
      .set("Origin", FOREIGN);
    expect(res.status).toBe(200);
  });
});

describe("isolation entre organisations", () => {
  it("les clés d'une organisation sont introuvables et intactes pour une autre", async () => {
    const b = bench();
    const a = await createWorld(b.database);
    const other = await createWorld(b.database);
    b.use(FakeLlm.replying("OK"));
    await providersApi(b.app, a.actors.owner).add({
      provider: "anthropic",
      apiKey: makeSentinel(),
    });
    const api = providersApi(b.app, other.actors.owner);
    const before = await sealedRows(b.database, a.organizationId);

    for (const res of [
      await api.verify("anthropic"),
      await api.replaceKey("anthropic", { apiKey: makeSentinel() }),
      await api.remove("anthropic"),
      await api.setPrimary("anthropic"),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    expect((await api.list()).body).toEqual({ items: [] });
    expect(await sealedRows(b.database, a.organizationId)).toEqual(before);
    void AI_ROUTES;
  });
});
