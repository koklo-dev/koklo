import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { llmApi, llmBench, worldOf } from "./helpers/llm-credential-routes.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";

/**
 * TK-95 D, contrat 1.1.0 : `llmCredential.set` accepte les six fournisseurs et `baseUrl` (point d'accès
 * compatible seulement, garde anti-SSRF) ; le statut public n'expose jamais l'adresse.
 */
const bench = llmBench({ beforeAll, afterAll, beforeEach });
const secret = makeSentinel();
const NEW_PROVIDERS = ["mistral", "openrouter"] as const;

async function owner() {
  const b = bench();
  const world = await worldOf(b);
  return { b, world, api: llmApi(b.app, world.actors.owner) };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("six fournisseurs par la route", () => {
  it.each(NEW_PROVIDERS)("%s : 200, statut sans adresse ni clé, listé", async (provider) => {
    const { api } = await owner();
    const res = await api.set(provider, { apiKey: secret });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.provider).toBe(provider);
    expect(JSON.stringify(res.body)).not.toContain(secret);
    const list = await api.list();
    expect(list.body.items.map((i: { provider: string }) => i.provider)).toEqual([provider]);
  });

  it("point d'accès compatible avec une adresse https publique : 200, adresse absente du statut", async () => {
    const { api } = await owner();
    const res = await api.set("openai_compatible", {
      apiKey: secret,
      baseUrl: "https://llm.exemple-public.fr/v1",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("exemple-public");
    expect(JSON.stringify((await api.list()).body)).not.toContain("exemple-public");
  });

  it("point d'accès compatible sans adresse : 422 VALIDATION sur baseUrl", async () => {
    const { api } = await owner();
    const res = await api.set("openai_compatible", { apiKey: secret });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain("baseUrl");
  });

  it("baseUrl pour un autre fournisseur : 422", async () => {
    const { api } = await owner();
    const res = await api.set("openai", {
      apiKey: secret,
      baseUrl: "https://llm.exemple-public.fr",
    });
    expect(res.status).toBe(422);
  });

  it.each([
    "http://llm.exemple-public.fr/v1",
    "https://localhost/v1",
    "https://127.0.0.1/v1",
    "https://169.254.169.254/latest",
    "https://10.0.0.5/v1",
    "https://[::1]/v1",
    "https://utilisateur:motdepasse@llm.exemple-public.fr/v1",
    "https://llm.exemple-public.fr:8443/v1",
  ])(
    "adresse dangereuse %s : 422, l'adresse n'est pas répétée, rien n'est écrit",
    async (baseUrl) => {
      const { b, world, api } = await owner();
      const res = await api.set("openai_compatible", { apiKey: secret, baseUrl });
      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).not.toContain(baseUrl);
      expect(JSON.stringify(res.body)).not.toContain("motdepasse");
      const rows = await b.database.query(
        "SELECT 1 FROM llm_provider_credentials WHERE organization_id = $1",
        [world.organizationId],
      );
      expect(rows).toEqual([]);
    },
  );

  it("l'adresse stockée ne figure ni dans l'audit ni dans les journaux", async () => {
    const { b, world, api } = await owner();
    await api.set("openai_compatible", {
      apiKey: secret,
      baseUrl: "https://llm.exemple-public.fr/v1",
    });
    const audit = await b.database.query<{ text: string }>(
      "SELECT a::text AS text FROM audit_log a WHERE organization_id = $1",
      [world.organizationId],
    );
    expect(audit.map((r) => r.text).join("\n")).not.toContain("exemple-public");
  });
});
