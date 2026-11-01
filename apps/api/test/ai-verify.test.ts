import { FakeLlm } from "@koklo/domain/testing";
import { ANTHROPIC_DEFAULT_MODEL } from "@koklo/llm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_BUDGETS } from "../src/ai/ai-budget.ts";
import {
  aiApi,
  aiAuditRows,
  allAuditText,
  credentialState,
  installAiBench,
  keyedWorld,
  setKey,
} from "./helpers/ai-bench.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-54b, D9 : `llmCredential.verify` prouve qu'une clé fonctionne par un appel MINIMAL (budget
 * borné, prompt constant), sans rien conserver : ni sortie, ni clé, ni contenu. Il suit les mêmes
 * règles de clé que `ai.*` (`markUsed`, invalidation sur 401, quota, audit avant l'appel).
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("llmCredential.verify : appel minimal", () => {
  it("un seul appel, sortie texte, budget credential-verify, modèle par défaut de l'adaptateur", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const fake = FakeLlm.replying("OK", { servedModel: "modele-servi-3" });
    b.use(fake);

    const res = await aiApi(b.app, world.actors.owner).verify();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ ok: true, model: "modele-servi-3", checkedAt: b.clock.now() });
    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call?.trace.purpose).toBe("credential-verify");
    expect(call?.model).toBe(ANTHROPIC_DEFAULT_MODEL);
    expect(call?.output).toEqual({ kind: "text" });
    expect(call?.budget).toEqual(AI_BUDGETS["credential-verify"]);
    expect(call?.budget.maxOutputTokens).toBeLessThanOrEqual(16);
  });

  it("utilise le defaultModel de la clé quand il existe", async () => {
    const b = bench();
    const { world } = await keyedWorld(b, { defaultModel: "modele-org-7" });
    const fake = FakeLlm.replying("OK");
    b.use(fake);

    await aiApi(b.app, world.actors.owner).verify();

    expect(fake.calls[0]?.model).toBe("modele-org-7");
  });

  it("la sortie du modèle n'est jamais restituée ni stockée (quelle qu'elle soit)", async () => {
    const b = bench();
    const { world, key } = await keyedWorld(b);
    b.use(FakeLlm.replying("SORTIE-SENTINELLE-VERIFY-44 <b>html</b> https://evil.test"));

    const res = await aiApi(b.app, world.actors.owner).verify();

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["checkedAt", "model", "ok"]);
    expect(JSON.stringify(res.body)).not.toContain("SORTIE-SENTINELLE");
    expect(await allAuditText(b.database, world.organizationId)).not.toContain("SORTIE-SENTINELLE");
    expect(b.lines.join("\n")).not.toContain("SORTIE-SENTINELLE");
    expect(b.lines.join("\n")).not.toContain(key);
  });

  it("la ligne de la clé n'est pas modifiée sauf last_used_at (rien de stocké)", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const read = () =>
      b.database.query(
        "SELECT ciphertext, nonce, key_version, default_model, invalidated_at, created_at, updated_at FROM llm_provider_credentials WHERE organization_id = $1",
        [world.organizationId],
      );
    const before = await read();
    b.use(FakeLlm.replying("OK"));

    await aiApi(b.app, world.actors.owner).verify();

    expect(await read()).toEqual(before);
    expect((await credentialState(b.database, world.organizationId))?.last_used_at).not.toBeNull();
  });

  it("une réponse tronquée ou vide reste un succès (on vérifie la clé, pas le contenu)", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(new FakeLlm().script([{ reply: "", stop: "max-tokens" }]));

    const res = await aiApi(b.app, world.actors.owner).verify();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("un refus du modèle (LlmRefusedError) est une erreur du fournisseur, la clé n'est pas marquée utilisée", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { LlmRefusedError } = await import("@koklo/domain");
    b.use(FakeLlm.failing(new LlmRefusedError({ operation: "complete" })));

    const res = await aiApi(b.app, world.actors.owner).verify();

    expect(res.status).toBe(502);
    expect(res.body.data).toEqual({ reason: "refused" });
    expect((await credentialState(b.database, world.organizationId))?.last_used_at).toBeNull();
  });

  it("un fournisseur sans adaptateur dans le registre (openai en 0.9.0) : 502 unavailable, rien d'envoyé ni d'audité", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    await send(b.app, world.actors.owner.cookie, "put", "/llm-credentials/openai", {
      provider: "openai",
      apiKey: "FAKE-KEY-NOT-REAL-OPENAI-0801",
    });
    const fake = FakeLlm.replying("OK");
    b.use(fake);

    const res = await aiApi(b.app, world.actors.owner).verify("openai");

    expect(res.status, JSON.stringify(res.body)).toBe(502);
    expect(res.body.code).toBe("LLM_PROVIDER_ERROR");
    expect(res.body.data).toEqual({ reason: "unavailable" });
    expect(fake.calls).toHaveLength(0);
    expect(b.provider.keysSeen).toEqual([]);
    expect(await aiAuditRows(b.database, world.organizationId)).toEqual([]);
  });

  it("verify sur la clé d'un autre fournisseur n'utilise pas la clé anthropic", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying("OK"));

    const res = await aiApi(b.app, world.actors.owner).verify("google");

    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ reason: "missing" });
    expect(b.provider.keysSeen).toEqual([]);
  });

  it("une clé remplacée est vérifiée avec la nouvelle valeur", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    await setKey(b.app, world, "FAKE-KEY-NOT-REAL-VERIFY-NEUVE-0802");
    b.use(FakeLlm.replying("OK"));

    await aiApi(b.app, world.actors.owner).verify();

    expect(b.provider.keysSeen).toEqual(["FAKE-KEY-NOT-REAL-VERIFY-NEUVE-0802"]);
  });
});
