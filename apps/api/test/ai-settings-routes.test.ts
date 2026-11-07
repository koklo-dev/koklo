import type { LlmProviderId } from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench, TEST_CATALOG } from "./helpers/ai-bench.ts";
import { insertUsage, providersApi, settingsRows, usageModelRows } from "./helpers/ai-providers.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";
import { auditActions } from "./helpers/settings.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-98 lot A, cas 7 à 9 : `aiUsage.set`, `aiSettings.get|update`, `aiUsage.report`, `aiModel.listQualified`.
 * Tout est validé côté serveur ; chaque écriture est auditée (`ai_settings.update`) sans valeur.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
const apiOf = (world: World) => providersApi(bench().app, world.actors.owner);
const auditCount = async (world: World, action: string) =>
  (await auditActions(bench().database, world.organizationId)).filter((a) => a === action).length;

async function worldWith(...providers: LlmProviderId[]) {
  const b = bench();
  const world = await createWorld(b.database);
  b.use(FakeLlm.replying("OK"));
  for (const provider of providers) {
    const res = await apiOf(world).add({ provider, apiKey: makeSentinel() });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }
  return { b, world };
}

describe("aiModel.listQualified", () => {
  it("rend le catalogue qualifié tel quel", async () => {
    const { world } = await worldWith();
    const res = await apiOf(world).models();
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual(
      TEST_CATALOG.map((entry) => ({ ...entry, usages: [...entry.usages] })),
    );
  });
});

describe("aiUsage.set : un modèle qualifié, d'un fournisseur doté d'une clé", () => {
  it("choisit, puis model:null efface (retour au modèle par défaut)", async () => {
    const { b, world } = await worldWith("anthropic", "openai");
    const set = await apiOf(world).setUsage("idea_space", {
      provider: "openai",
      model: "openai-qualifie",
    });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body).toEqual({
      usage: "idea_space",
      provider: "openai",
      model: "openai-qualifie",
      isDefault: false,
    });
    expect(await usageModelRows(b.database, world.organizationId)).toEqual([
      { usage: "idea_space", provider: "openai", model: "openai-qualifie" },
    ]);
    const settings = await apiOf(world).settings();
    expect(settings.body.usages).toContainEqual({
      usage: "idea_space",
      provider: "openai",
      model: "openai-qualifie",
      isDefault: false,
    });

    const cleared = await apiOf(world).setUsage("idea_space", { model: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ usage: "idea_space", isDefault: true });
    expect(await usageModelRows(b.database, world.organizationId)).toEqual([]);
    expect(await auditCount(world, "ai_settings.update")).toBe(2);
  });

  it.each([
    ["modèle non qualifié", { provider: "openai", model: "inconnu-1" }, "model"],
    ["fournisseur sans clé", { provider: "google", model: "google-qualifie" }, "provider"],
    ["modèle d'un autre fournisseur", { provider: "openai", model: "claude-sonnet-5-5" }, "model"],
  ])("%s : 422 VALIDATION, rien d'écrit ni d'audité", async (_label, body, field) => {
    const { b, world } = await worldWith("anthropic", "openai");
    const before = await auditCount(world, "ai_settings.update");
    const res = await apiOf(world).setUsage("idea_space", body);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(res.body.data.field).toBe(field);
    expect(res.text).not.toMatch(/openai|anthropic|google/i);
    expect(await usageModelRows(b.database, world.organizationId)).toEqual([]);
    expect(await auditCount(world, "ai_settings.update")).toBe(before);
  });

  it("usage inconnu ou fournisseur sans modèle : 422 avant toute écriture", async () => {
    const { world } = await worldWith("anthropic");
    expect((await apiOf(world).setUsage("inconnu", { model: null })).status).toBe(422);
    expect(
      (await apiOf(world).setUsage("idea_space", { provider: "anthropic", model: null })).status,
    ).toBe(422);
  });
});

describe("aiSettings.get", () => {
  it("par défaut : secours actif, pas de plafond, quatre usages au modèle par défaut", async () => {
    const { world } = await worldWith();
    const res = await apiOf(world).settings();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      fallbackEnabled: true,
      usages: ["idea_space", "spec_deliverables", "baseline_summary", "ticket_breakdown"].map(
        (usage) => ({ usage, isDefault: true }),
      ),
    });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("aiSettings.update", () => {
  it.each([0, -1, 1.5, "10", Number.MAX_SAFE_INTEGER + 2])(
    "plafond %s refusé : 422, rien d'écrit",
    async (cap) => {
      const { b, world } = await worldWith("anthropic");
      const before = await auditCount(world, "ai_settings.update");
      const res = await apiOf(world).update({ monthlyCapMicroUsd: cap });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
      expect(
        (await settingsRows(b.database, world.organizationId))[0]?.monthly_cap_micro_usd,
      ).toBeNull();
      expect(await auditCount(world, "ai_settings.update")).toBe(before);
    },
  );

  it("pose, relit puis retire le plafond (null, A1) ; un nouveau plafond rouvre l'alerte", async () => {
    const { b, world } = await worldWith("anthropic");
    const set = await apiOf(world).update({ monthlyCapMicroUsd: 5_000_000 });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.monthlyCapMicroUsd).toBe(5_000_000);
    expect((await apiOf(world).settings()).body.monthlyCapMicroUsd).toBe(5_000_000);
    await b.database.query(
      "UPDATE ai_organization_settings SET cap_warned_month = '2026-11-01' WHERE organization_id = $1",
      [world.organizationId],
    );

    await apiOf(world).update({ monthlyCapMicroUsd: 6_000_000 });
    expect((await settingsRows(b.database, world.organizationId))[0]?.cap_warned_month).toBeNull();

    const removed = await apiOf(world).update({ monthlyCapMicroUsd: null });
    expect(removed.status).toBe(200);
    expect(removed.body).not.toHaveProperty("monthlyCapMicroUsd");
  });

  it("secours : un fournisseur doté d'une clé, jamais le principal ; null le retire ; une seule ligne d'audit par appel", async () => {
    const { b, world } = await worldWith("anthropic", "openai");
    const same = await apiOf(world).update({ fallback: "anthropic" });
    expect(same.status).toBe(422);
    expect(same.body.data.field).toBe("fallback");
    expect((await apiOf(world).update({ fallback: "google" })).status).toBe(422);
    const before = await auditCount(world, "ai_settings.update");

    const both = await apiOf(world).update({
      fallback: "openai",
      fallbackEnabled: true,
      monthlyCapMicroUsd: 1_000,
    });
    expect(both.status, JSON.stringify(both.body)).toBe(200);
    expect(both.body.fallbackEnabled).toBe(true);
    expect(await auditCount(world, "ai_settings.update")).toBe(before + 1);
    expect((await settingsRows(b.database, world.organizationId))[0]).toMatchObject({
      fallback_provider: "openai",
      fallback_enabled: true,
    });

    expect((await apiOf(world).update({ fallback: null })).status).toBe(200);
    expect((await settingsRows(b.database, world.organizationId))[0]?.fallback_provider).toBeNull();
  });

  it("cloisonné : les réglages d'une organisation ne touchent pas l'autre", async () => {
    const { b, world } = await worldWith("anthropic");
    const other = await createWorld(b.database);
    await apiOf(world).update({ monthlyCapMicroUsd: 42 });
    expect((await apiOf(other).settings()).body).not.toHaveProperty("monthlyCapMicroUsd");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("aiUsage.report", () => {
  it("une ligne par fournisseur, total, plafond et capState ok / warning / suspended", async () => {
    const { world } = await worldWith("anthropic", "openai");
    const org = world.organizationId;
    await insertUsage(bench().database, org, {
      month: "2026-10",
      provider: "anthropic",
      calls: 4,
      costMicroUsd: 600,
    });
    await insertUsage(bench().database, org, {
      month: "2026-10",
      provider: "openai",
      calls: 2,
      costMicroUsd: 200,
    });

    const none = await apiOf(world).report("?month=2026-10");
    expect(none.status, JSON.stringify(none.body)).toBe(200);
    expect(none.body).toEqual({
      month: "2026-10",
      providers: [
        { provider: "anthropic", calls: 4, inputTokens: 100, outputTokens: 40, costMicroUsd: 600 },
        { provider: "openai", calls: 2, inputTokens: 100, outputTokens: 40, costMicroUsd: 200 },
      ],
      totalCostMicroUsd: 800,
      capState: "ok",
    });
    for (const [cap, state] of [
      [10_000, "ok"],
      [1_000, "warning"],
      [800, "suspended"],
    ] as const) {
      await apiOf(world).update({ monthlyCapMicroUsd: cap });
      const res = await apiOf(world).report("?month=2026-10");
      expect(res.body.monthlyCapMicroUsd, String(cap)).toBe(cap);
      expect(res.body.capState, String(cap)).toBe(state);
    }
  });

  it("sans mois : le mois courant, vide ; mois invalide : 422", async () => {
    const { b, world } = await worldWith();
    const current = await apiOf(world).report();
    expect(current.status).toBe(200);
    expect(current.body.month).toBe(b.clock.now().slice(0, 7));
    expect(current.body.providers).toEqual([]);
    for (const month of ["2026-13", "26-10", "octobre"]) {
      const res = await apiOf(world).report(`?month=${month}`);
      expect(res.status, month).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
    }
  });

  it("cloisonné : la consommation d'une autre organisation n'apparaît pas", async () => {
    const { b, world } = await worldWith();
    const other = await createWorld(b.database);
    await insertUsage(b.database, other.organizationId, {
      month: "2026-10",
      provider: "openai",
      calls: 1,
      costMicroUsd: 5,
    });
    expect((await apiOf(world).report("?month=2026-10")).body.providers).toEqual([]);
  });
});
