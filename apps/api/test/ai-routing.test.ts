import { LlmAuthError, LlmProviderUnavailableError, LlmRateLimitedError } from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  aiApi,
  BRIEF_REPLY,
  CRITERION,
  credentialState,
  criteriaReply,
  featuresReply,
  installAiBench,
  keyedWorld,
  setKey,
} from "./helpers/ai-bench.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";
import { type FeatureSeed, readScene, seedIndex } from "./helpers/spec-read.ts";
import { send, type World } from "./helpers/tickets.ts";

/**
 * TK-95 D, sur base réelle : les procédures `ai.*` passent par le moteur (usage -> fournisseur + modèle),
 * le secours, le comptage persisté et le plafond mensuel. `llmCredential.verify` n'a pas d'usage.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
const FEATURE: FeatureSeed = {
  id: "F-001",
  titre: "Connexion",
  statut: "brouillon",
  priorite: "must",
  description: "Se connecter par lien magique.",
  criteres: [{ titre: "Lien envoyé", etapes: [{ type: "etant_donne", texte: "un compte" }] }],
};
const call = { operation: "complete", provider: "anthropic" } as const;

async function keyFor(app: INestApplication, world: World, provider: string): Promise<string> {
  const apiKey = makeSentinel();
  const res = await send(app, world.actors.owner.cookie, "put", `/llm-credentials/${provider}`, {
    provider,
    apiKey,
  });
  if (res.status !== 200) throw new Error(JSON.stringify(res.body));
  return apiKey;
}

const settings = (world: World, values: string) =>
  bench().database.query(
    `INSERT INTO ai_organization_settings (organization_id, ${values.split("|")[0]}, created_at, updated_at)
     VALUES ($1, ${values.split("|")[1]}, now(), now())`,
    [world.organizationId],
  );
const usageRow = (world: World, usage: string, provider: string, model: string) =>
  bench().database.query(
    `INSERT INTO ai_usage_models (organization_id, usage, provider, model, created_at, updated_at)
     VALUES ($1, $2::ai_usage, $3::llm_provider, $4, now(), now())`,
    [world.organizationId, usage, provider, model],
  );
const monthly = (world: World) =>
  bench().database.query<{ provider: string; calls: number; input_tokens: string; cost: string }>(
    `SELECT provider::text AS provider, calls, input_tokens::text AS input_tokens,
            cost_micro_usd::text AS cost FROM ai_usage_monthly WHERE organization_id = $1 ORDER BY provider`,
    [world.organizationId],
  );
const monthStart = () => {
  const now = new Date(bench().clock.now());
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
};
const seedCost = (world: World, cost: number) =>
  bench().database.query(
    `INSERT INTO ai_usage_monthly (organization_id, month, provider, calls, input_tokens, output_tokens, cost_micro_usd, created_at, updated_at)
     VALUES ($1, $2::date, 'anthropic', 1, 1, 1, $3, now(), now())`,
    [world.organizationId, monthStart(), cost],
  );
const audit = (world: World, action: string) =>
  bench().database.query<{ actor_id: string | null; target_kind: string; target_id: string }>(
    "SELECT actor_id, target_kind, target_id FROM audit_log WHERE organization_id = $1 AND action = $2",
    [world.organizationId, action],
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("rattachement des procédures aux usages (B46)", () => {
  it("draftBrief -> Espace Idée ; proposeFeatures et proposeCriteria -> Livrables de la spec", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    await usageRow(world, "idea_space", "anthropic", "modele-idee-1");
    await usageRow(world, "spec_deliverables", "anthropic", "modele-livrables-1");
    const api = aiApi(b.app, world.actors.dev);

    const brief = FakeLlm.replying(BRIEF_REPLY);
    b.use(brief);
    expect((await api.draftBrief(world.projectId)).status).toBe(200);
    expect(brief.calls.map((c) => c.model)).toEqual(["modele-idee-1"]);

    const features = FakeLlm.replying(featuresReply());
    b.use(features);
    expect((await api.proposeFeatures(world.projectId)).status).toBe(200);
    expect(features.calls.map((c) => c.model)).toEqual(["modele-livrables-1"]);
  });

  it("proposeCriteria -> Livrables de la spec (feature lue dans l'index)", async () => {
    const b = bench();
    const scene = await readScene(b);
    await seedIndex(b, scene, [FEATURE], { commit: true });
    await setKey(b.app, scene.world, makeSentinel());
    await usageRow(scene.world, "spec_deliverables", "anthropic", "modele-livrables-1");
    const fake = FakeLlm.replying(criteriaReply(CRITERION));
    b.use(fake);

    const res = await aiApi(b.app, scene.world.actors.dev).proposeCriteria(scene.projectId, {
      specId: "F-001",
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(fake.calls.map((c) => c.model)).toEqual(["modele-livrables-1"]);
  });

  it("verify n'a pas d'usage : ni ligne d'usage, ni plafond, le modèle par défaut du fournisseur nommé", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    await usageRow(world, "idea_space", "anthropic", "modele-idee-1");
    await seedCost(world, 5_000);
    await settings(world, "primary_provider, monthly_cap_micro_usd|'anthropic', 1000");
    const fake = FakeLlm.replying("OK");
    b.use(fake);

    const res = await aiApi(b.app, world.actors.owner).verify();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(fake.calls.map((c) => c.model)).toEqual(["claude-sonnet-5-5"]);
  });

  it("sans ligne d'usage ni réglage : Anthropic Sonnet (A4), modèle de la clé s'il existe", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const fake = FakeLlm.replying(BRIEF_REPLY);
    b.use(fake);
    await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);
    expect(fake.calls.map((c) => c.model)).toEqual(["claude-sonnet-5-5"]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("secours de bout en bout", () => {
  const scene = async () => {
    const b = bench();
    const { world, key } = await keyedWorld(b);
    const openaiKey = await keyFor(b.app, world, "openai");
    await settings(world, "primary_provider, fallback_provider|'anthropic', 'openai'");
    return { b, world, key, openaiKey };
  };

  it("limite du principal : la demande repart chez le secours, la réponse nomme le fournisseur servi", async () => {
    const { b, world, key, openaiKey } = await scene();
    b.useFor("anthropic", FakeLlm.failing(new LlmRateLimitedError({ ...call, retryAfterMs: 0 })));
    b.useFor("openai", FakeLlm.replying(BRIEF_REPLY, { servedModel: "modele-servi-secours" }));

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta.provider).toBe("openai");
    expect(res.body.meta.model).toBe("modele-servi-secours");
    expect(b.lines.join("\n")).toContain("llm.fallback");
    for (const secret of [key, openaiKey]) {
      expect(b.lines.join("\n")).not.toContain(secret);
      expect(JSON.stringify(res.body)).not.toContain(secret);
    }
    expect((await monthly(world)).map((r) => [r.provider, r.calls])).toEqual([["openai", 1]]);
  });

  it("secours désactivé : l'erreur d'origine, rien chez le secours", async () => {
    const { b, world } = await scene();
    await b.database.query(
      "UPDATE ai_organization_settings SET fallback_enabled = false WHERE organization_id = $1",
      [world.organizationId],
    );
    b.useFor("anthropic", FakeLlm.failing(new LlmProviderUnavailableError(call)));
    const openai = FakeLlm.replying(BRIEF_REPLY);
    b.useFor("openai", openai);

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(502);
    expect(res.body.data).toEqual({ reason: "unavailable" });
    expect(openai.calls).toHaveLength(0);
    expect(await monthly(world)).toEqual([]);
  });

  it("401 du principal : sa clé est invalidée (audit signé de l'utilisateur), le secours répond", async () => {
    const { b, world } = await scene();
    b.useFor("anthropic", FakeLlm.failing(new LlmAuthError({ ...call, status: 401 })));
    b.useFor("openai", FakeLlm.replying(BRIEF_REPLY));

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(200);
    expect(
      (await credentialState(b.database, world.organizationId))?.invalidated_at,
    ).not.toBeNull();
    const rows = await audit(world, "llm_credential.invalidate");
    expect(rows.map((r) => r.actor_id)).toEqual([world.actors.dev.userId]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("comptage et plafond mensuel", () => {
  it("un appel réussi persiste ses jetons et son coût chez le fournisseur servi", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);
    const [row, ...others] = await monthly(world);
    expect(others).toEqual([]);
    expect(row?.provider).toBe("anthropic");
    expect(row?.calls).toBe(1);
    expect(Number(row?.input_tokens)).toBeGreaterThan(0);
    expect(Number(row?.cost)).toBeGreaterThan(0);
  });

  it("un appel en erreur ne compte rien", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.failing(new LlmProviderUnavailableError(call)));
    await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);
    expect(await monthly(world)).toEqual([]);
  });

  it("à 100 % : LLM_CAP_REACHED avant tout appel, sans audit ni quota ; verify n'est pas suspendu", async () => {
    const b = bench();
    const { world, key } = await keyedWorld(b);
    await settings(world, "primary_provider, monthly_cap_micro_usd|'anthropic', 1000");
    await seedCost(world, 1_000);
    const fake = FakeLlm.replying(BRIEF_REPLY);
    b.use(fake);
    const api = aiApi(b.app, world.actors.dev);

    for (const res of [
      await api.draftBrief(world.projectId),
      await api.proposeFeatures(world.projectId),
    ]) {
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.code).toBe("LLM_CAP_REACHED");
      expect(JSON.stringify(res.body)).not.toMatch(/anthropic|openai|google|mistral|openrouter/i);
      expect(JSON.stringify(res.body)).not.toContain(key);
    }
    expect(fake.calls).toHaveLength(0);
    expect(b.provider.keysSeen).toEqual([]);
    expect(await audit(world, "ai.brief.draft")).toEqual([]);

    b.use(FakeLlm.replying("OK"));
    expect((await aiApi(b.app, world.actors.owner).verify()).status).toBe(200);
  });

  it("le mois suivant repart de zéro", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    await settings(world, "primary_provider, monthly_cap_micro_usd|'anthropic', 1000");
    await seedCost(world, 1_000);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    const api = aiApi(b.app, world.actors.dev);
    expect((await api.draftBrief(world.projectId)).status).toBe(409);

    b.clock.advance(32 * 24 * 3600 * 1000);
    expect((await api.draftBrief(world.projectId)).status).toBe(200);
  });

  it("sans plafond saisi, aucune suspension quelle que soit la consommation (A1)", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    await seedCost(world, 900_000_000_000);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    expect((await aiApi(b.app, world.actors.dev).draftBrief(world.projectId)).status).toBe(200);
  });

  it("à 80 % : une seule ligne d'audit ai.cap_warning par mois, signée de l'utilisateur", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    await settings(world, "primary_provider, monthly_cap_micro_usd|'anthropic', 1000000");
    await seedCost(world, 800_000);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    const api = aiApi(b.app, world.actors.dev);

    expect((await api.draftBrief(world.projectId)).status).toBe(200);
    expect((await api.draftBrief(world.projectId)).status).toBe(200);

    const rows = await audit(world, "ai.cap_warning");
    expect(rows).toEqual([
      {
        actor_id: world.actors.dev.userId,
        target_kind: "organization",
        target_id: world.organizationId,
      },
    ]);
  });
});
