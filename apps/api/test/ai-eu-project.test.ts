import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aiApi, BRIEF_REPLY, installAiBench, keyedWorld } from "./helpers/ai-bench.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";
import { send, type World } from "./helpers/tickets.ts";

/**
 * TK-93 lot A (B304, cas 8) : `AiCallRunner` lit `eu_only` du projet. Un projet « données en UE » ne
 * touche jamais OpenRouter, qu'il soit configuré en principal ou en secours ; sans UE, il l'est.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

async function keyFor(world: World, provider: string): Promise<void> {
  const res = await send(
    bench().app,
    world.actors.owner.cookie,
    "put",
    `/llm-credentials/${provider}`,
    { provider, apiKey: makeSentinel() },
  );
  if (res.status !== 200) throw new Error(JSON.stringify(res.body));
}

const settings = (world: World, columns: string, values: string) =>
  bench().database.query(
    `INSERT INTO ai_organization_settings (organization_id, ${columns}, created_at, updated_at)
     VALUES ($1, ${values}, now(), now())`,
    [world.organizationId],
  );
const setEu = (world: World, euOnly: boolean) =>
  bench().database.query("UPDATE projects SET eu_only = $2 WHERE id = $1", [
    world.projectId,
    euOnly,
  ]);

async function scene(columns: string, values: string) {
  const b = bench();
  const { world } = await keyedWorld(b);
  await keyFor(world, "openrouter");
  await settings(world, columns, values);
  const openrouter = FakeLlm.replying(BRIEF_REPLY);
  const anthropic = FakeLlm.replying(BRIEF_REPLY);
  b.useFor("openrouter", openrouter);
  b.useFor("anthropic", anthropic);
  return { b, world, openrouter, anthropic };
}

describe("TK-93 projet en UE : le moteur exclut OpenRouter", () => {
  it("OpenRouter en principal : projet UE, l'adaptateur OpenRouter n'est jamais appelé", async () => {
    const { b, world, openrouter, anthropic } = await scene("primary_provider", "'openrouter'");
    await setEu(world, true);
    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(openrouter.calls).toHaveLength(0);
    expect(anthropic.calls.length).toBeGreaterThan(0);
  });

  it("OpenRouter en secours : projet UE, jamais appelé même quand le principal est en panne", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    await keyFor(world, "openrouter");
    await settings(world, "primary_provider, fallback_provider", "'anthropic', 'openrouter'");
    const openrouter = FakeLlm.replying(BRIEF_REPLY);
    const { LlmRateLimitedError } = await import("@koklo/domain");
    b.useFor(
      "anthropic",
      FakeLlm.failing(
        new LlmRateLimitedError({ operation: "complete", provider: "anthropic", retryAfterMs: 0 }),
      ),
    );
    b.useFor("openrouter", openrouter);
    await setEu(world, true);
    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);
    expect(res.status).not.toBe(200);
    expect(openrouter.calls).toHaveLength(0);
  });

  it("sans UE : OpenRouter reste utilisable comme principal", async () => {
    const { b, world, openrouter } = await scene("primary_provider", "'openrouter'");
    await setEu(world, false);
    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(openrouter.calls.length).toBeGreaterThan(0);
  });

  it("un projet inconnu est traité en UE par prudence (jamais OpenRouter)", async () => {
    const { b, world, openrouter } = await scene("primary_provider", "'openrouter'");
    await b.database.query("DELETE FROM projects WHERE id = $1", [world.projectId]);
    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);
    expect(res.status).not.toBe(200);
    expect(openrouter.calls).toHaveLength(0);
  });
});
