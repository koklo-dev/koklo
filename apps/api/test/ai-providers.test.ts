import {
  LlmAuthError,
  type LlmProviderId,
  LlmRateLimitedError,
  LlmTimeoutError,
} from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_BUDGETS } from "../src/ai/ai-budget.ts";
import { allAuditText, installAiBench } from "./helpers/ai-bench.ts";
import {
  insertUsage,
  providersApi,
  sealedRows,
  settingsRows,
  usageModelRows,
} from "./helpers/ai-providers.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";
import { auditActions } from "./helpers/settings.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-98 lot A, cas 1 à 6 : `aiProvider.*` (contrat 2.3.0). Une clé n'est enregistrée qu'après un test réussi
 * (B122) ; le premier fournisseur devient principal, le deuxième secours éteint (B124) ; rien d'une
 * tentative échouée ne subsiste en base.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
const ok = () => FakeLlm.replying("OK");
const apiOf = (world: World, role: "owner" | "admin" = "owner") =>
  providersApi(bench().app, world.actors[role]);
const orgOf = (world: World) => world.organizationId;

async function worldWith(...providers: LlmProviderId[]) {
  const b = bench();
  const world = await createWorld(b.database);
  b.use(ok());
  const keys: Record<string, string> = {};
  for (const provider of providers) {
    keys[provider] = makeSentinel();
    const res = await apiOf(world).add({ provider, apiKey: keys[provider] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }
  return { b, world, keys };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("aiProvider.add : test avant écriture, rôles automatiques", () => {
  // biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
  it("1er fournisseur principal, 2e secours éteint, 3e sans rôle ; lastUsedAt posé ; audit sans secret", async () => {
    const b = bench();
    const world = await createWorld(b.database);
    const fake = ok();
    b.use(fake);
    const keys = [makeSentinel(), makeSentinel(), makeSentinel()];

    const first = await apiOf(world).add({ provider: "anthropic", apiKey: keys[0] });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({
      provider: "anthropic",
      role: "primary",
      status: "verified",
      intermediary: false,
      euEligible: true,
      baseUrlRequired: false,
    });
    expect(first.body.lastUsedAt).toEqual(expect.any(String));
    expect(Object.keys(first.body).sort()).toEqual([
      "baseUrlRequired",
      "euEligible",
      "intermediary",
      "lastUsedAt",
      "provider",
      "role",
      "status",
    ]);

    const second = await apiOf(world).add({ provider: "openai", apiKey: keys[1] });
    expect(second.body).toMatchObject({ provider: "openai", role: "fallback" });
    const third = await apiOf(world).add({ provider: "openrouter", apiKey: keys[2] });
    expect(third.body).toMatchObject({
      provider: "openrouter",
      role: null,
      intermediary: true,
      euEligible: false,
    });

    expect(await settingsRows(b.database, orgOf(world))).toEqual([
      expect.objectContaining({
        primary_provider: "anthropic",
        fallback_provider: "openai",
        fallback_enabled: false,
      }),
    ]);
    const rows = await sealedRows(b.database, orgOf(world));
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.last_used_at !== null)).toBe(true);
    // Le test utilise la clé saisie, le modèle du catalogue et le budget de vérification.
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls[0]?.model).toBe("claude-sonnet-5-5");
    expect(fake.calls[0]?.budget).toEqual(AI_BUDGETS["credential-verify"]);
    expect(b.provider.keysSeen).toEqual(keys);

    const actions = await auditActions(b.database, orgOf(world));
    expect(actions.filter((a) => a === "ai_provider.add")).toHaveLength(3);
    expect(actions).not.toContain("llm_credential.create");
    const audit = await allAuditText(b.database, orgOf(world));
    for (const key of keys) expect(audit).not.toContain(key);
  });

  it("un fournisseur déjà configuré : 409 already_configured, aucun appel au fournisseur", async () => {
    const { b, world } = await worldWith("anthropic");
    const fake = ok();
    b.use(fake);
    const before = await sealedRows(b.database, orgOf(world));

    const res = await apiOf(world).add({ provider: "anthropic", apiKey: makeSentinel() });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
    expect(res.body.data).toEqual({ reason: "already_configured" });
    expect(fake.calls).toHaveLength(0);
    expect(await sealedRows(b.database, orgOf(world))).toEqual(before);
  });

  it("le modèle saisi sert au test ; il est conservé seulement s'il ne contient pas de « / »", async () => {
    const { b, world } = await worldWith();
    const fake = ok();
    b.use(fake);
    const plain = await apiOf(world).add({
      provider: "mistral",
      apiKey: makeSentinel(),
      model: "mon-modele",
    });
    const slashed = await apiOf(world).add({
      provider: "openrouter",
      apiKey: makeSentinel(),
      model: "editeur/modele-1",
    });

    expect(plain.status, JSON.stringify(plain.body)).toBe(200);
    expect(slashed.status, JSON.stringify(slashed.body)).toBe(200);
    expect(fake.calls.map((call) => call.model)).toEqual(["mon-modele", "editeur/modele-1"]);
    const rows = await sealedRows(b.database, orgOf(world));
    expect(rows.map((row) => [row.provider, row.default_model])).toEqual([
      ["mistral", "mon-modele"],
      ["openrouter", null],
    ]);
    expect(plain.body.defaultModel).toBe("mon-modele");
  });

  it("sans modèle ni qualifié au catalogue : 502 unavailable, rien d'écrit", async () => {
    const b = bench();
    const world = await createWorld(b.database);
    const app = await b.makeApp({ defaultRegistry: true });
    const res = await providersApi(app, world.actors.owner).add({
      provider: "openai",
      apiKey: makeSentinel(),
    });
    expect(res.status).toBe(502);
    expect(res.body.data).toEqual({ reason: "unavailable" });
    expect(await sealedRows(b.database, orgOf(world))).toEqual([]);
  });
});

const FAILURES: [string, () => FakeLlm, number, string][] = [
  [
    "clé refusée",
    () => FakeLlm.failing(new LlmAuthError({ operation: "complete", status: 401 })),
    502,
    "LLM_PROVIDER_ERROR",
  ],
  [
    "délai dépassé",
    () => FakeLlm.failing(new LlmTimeoutError({ operation: "complete" })),
    502,
    "LLM_PROVIDER_ERROR",
  ],
  [
    "limite du fournisseur",
    () => FakeLlm.failing(new LlmRateLimitedError({ operation: "complete", retryAfterMs: 1000 })),
    429,
    "LLM_RATE_LIMITED",
  ],
];

describe("aiProvider.add : un test échoué n'écrit rien", () => {
  it.each(FAILURES)(
    "%s : aucune ligne, aucun réglage, aucun audit d'ajout",
    async (_label, failing, status, code) => {
      const b = bench();
      const world = await createWorld(b.database);
      b.use(failing());

      const res = await apiOf(world).add({ provider: "anthropic", apiKey: makeSentinel() });

      expect(res.status, JSON.stringify(res.body)).toBe(status);
      expect(res.body.code).toBe(code);
      expect(await sealedRows(b.database, orgOf(world))).toEqual([]);
      expect(await settingsRows(b.database, orgOf(world))).toEqual([]);
      const actions = await auditActions(b.database, orgOf(world));
      expect(
        actions.filter(
          (a) =>
            a.startsWith("ai_provider.") ||
            (a.startsWith("llm_credential.") && a !== "llm_credential.verify"),
        ),
      ).toEqual([]);
    },
  );

  it("le quota de tests de l'organisation refuse sans appeler le fournisseur ni écrire", async () => {
    const b = bench();
    const world = await createWorld(b.database);
    const app = await b.makeApp({ limits: { maxVerifyPerHourOrg: 1 } });
    const failing = FakeLlm.failing(new LlmAuthError({ operation: "complete", status: 401 }));
    b.use(failing);
    const api = providersApi(app, world.actors.owner);
    expect((await api.add({ provider: "anthropic", apiKey: makeSentinel() })).status).toBe(502);
    b.use(ok());

    const limited = await api.add({ provider: "anthropic", apiKey: makeSentinel() });

    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("LLM_RATE_LIMITED");
    expect(await sealedRows(b.database, orgOf(world))).toEqual([]);
  });

  it("sans porte-clés : 503 avant tout test", async () => {
    const b = bench();
    const world = await createWorld(b.database);
    const fake = ok();
    b.use(fake);
    const res = await providersApi(b.appWithoutKey, world.actors.owner).add({
      provider: "anthropic",
      apiKey: makeSentinel(),
    });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("ENCRYPTION_UNAVAILABLE");
    expect(fake.calls).toHaveLength(0);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("aiProvider.replaceKey : l'ancienne clé reste tant que la nouvelle n'est pas prouvée", () => {
  it("échec : clé, révision et dates intactes ; succès : nouvelle révision, ancienne clé illisible", async () => {
    const { b, world, keys } = await worldWith("anthropic");
    const refused = makeSentinel();
    const accepted = makeSentinel();
    b.use(FakeLlm.replying("OK", { rejectedKeys: [refused] }));
    const before = await sealedRows(b.database, orgOf(world));

    const failed = await apiOf(world).replaceKey("anthropic", { apiKey: refused });

    expect(failed.status).toBe(502);
    expect(failed.body.data).toEqual({ reason: "auth" });
    expect(await sealedRows(b.database, orgOf(world))).toEqual(before);

    const done = await apiOf(world).replaceKey("anthropic", { apiKey: accepted });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body).toMatchObject({ provider: "anthropic", role: "primary", status: "verified" });
    const after = await sealedRows(b.database, orgOf(world));
    expect(after[0]?.nonce).not.toBe(before[0]?.nonce);
    expect(after[0]?.ct).not.toBe(before[0]?.ct);
    expect(after[0]?.last_used_at).not.toBeNull();

    b.provider.keysSeen = [];
    expect((await apiOf(world).verify("anthropic")).status).toBe(200);
    expect(b.provider.keysSeen).toEqual([accepted]);
    expect(b.provider.keysSeen).not.toContain(keys.anthropic);
    const actions = await auditActions(b.database, orgOf(world));
    expect(actions).toContain("ai_provider.replaceKey");
    expect(actions).not.toContain("llm_credential.replace");
  });

  it("une clé invalidée redevient vérifiée ; le modèle et l'adresse existants sont gardés", async () => {
    const { b, world } = await worldWith();
    b.use(ok());
    const added = await apiOf(world).add({
      provider: "openai_compatible",
      apiKey: makeSentinel(),
      baseUrl: "https://api.example.com/v1",
      model: "mon-modele",
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    await b.database.query(
      "UPDATE llm_provider_credentials SET invalidated_at = now() WHERE organization_id = $1",
      [orgOf(world)],
    );
    expect((await apiOf(world).list()).body.items[0].status).toBe("invalid");

    const res = await apiOf(world).replaceKey("openai_compatible", { apiKey: makeSentinel() });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe("verified");
    expect(res.body.defaultModel).toBe("mon-modele");
    const [row] = await sealedRows(b.database, orgOf(world));
    expect(row?.base_url).toBe(new URL("https://api.example.com/v1").toString());
    expect(row?.invalidated_at).toBeNull();
  });

  it("fournisseur sans clé : 404", async () => {
    const { world } = await worldWith("anthropic");
    const res = await apiOf(world).replaceKey("google", { apiKey: makeSentinel() });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("aiProvider.add : adresse de base (SSRF)", () => {
  const addCompatible = (world: World, baseUrl?: string, provider = "openai_compatible") =>
    apiOf(world).add({
      provider,
      apiKey: makeSentinel(),
      ...(baseUrl === undefined ? {} : { baseUrl }),
    });

  it("obligatoire pour openai_compatible, refusée pour tout autre fournisseur : 422, aucun appel", async () => {
    const { b, world } = await worldWith();
    const fake = ok();
    b.use(fake);
    const missing = await addCompatible(world);
    const extra = await addCompatible(world, "https://api.example.com/v1", "anthropic");
    expect(missing.status).toBe(422);
    expect(missing.body.data.field).toBe("baseUrl");
    expect(extra.status).toBe(422);
    expect(fake.calls).toHaveLength(0);
    expect(await sealedRows(b.database, orgOf(world))).toEqual([]);
  });

  it.each([
    "http://api.example.com/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.5/v1",
    "https://localhost/v1",
    "https://192.168.1.10/v1",
    "https://[::1]/v1",
    "ftp://api.example.com",
  ])(
    "adresse refusée %s : 422 sans l'adresse dans l'erreur, rien d'envoyé ni d'écrit",
    async (url) => {
      const { b, world } = await worldWith();
      const fake = ok();
      b.use(fake);
      const res = await addCompatible(world, url);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
      expect(res.text).not.toContain(new URL(url).hostname);
      expect(fake.calls).toHaveLength(0);
      expect(await sealedRows(b.database, orgOf(world))).toEqual([]);
    },
  );

  it("adresse valide : normalisée en base, jamais renvoyée par list ni add", async () => {
    const { b, world } = await worldWith();
    b.use(ok());
    const res = await addCompatible(world, "https://API.Example.com/v1");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.baseUrlRequired).toBe(true);
    expect((await sealedRows(b.database, orgOf(world)))[0]?.base_url).toBe(
      new URL("https://API.Example.com/v1").toString(),
    );
    const list = await apiOf(world).list();
    for (const text of [res.text, list.text])
      expect(text.toLowerCase()).not.toContain("example.com");
  });
});

describe("aiProvider.list et verify", () => {
  it("list : un élément par clé, statut et rôle ; vide sans clé ; cloisonné par organisation", async () => {
    const { b, world } = await worldWith("anthropic", "openai");
    const other = await createWorld(b.database);
    const list = await apiOf(world).list();
    expect(list.status).toBe(200);
    expect(
      list.body.items.map((item: { provider: string; role: string | null; status: string }) => [
        item.provider,
        item.role,
        item.status,
      ]),
    ).toEqual([
      ["anthropic", "primary", "verified"],
      ["openai", "fallback", "verified"],
    ]);
    expect((await apiOf(other).list()).body).toEqual({ items: [] });
  });

  it("list : une clé invalidée est « invalid », jamais « verified »", async () => {
    const { b, world } = await worldWith("anthropic");
    await b.database.query(
      "UPDATE llm_provider_credentials SET invalidated_at = now() WHERE organization_id = $1",
      [orgOf(world)],
    );
    const item = (await apiOf(world).list()).body.items[0];
    expect(item.status).toBe("invalid");
  });

  it("verify : { ok, model, checkedAt } ; sans clé 404 ; clé d'une autre organisation 404", async () => {
    const { b, world } = await worldWith("anthropic");
    const other = await createWorld(b.database);
    const res = await apiOf(world).verify("anthropic");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ ok: true, model: "claude-sonnet-5-5", checkedAt: b.clock.now() });
    expect((await apiOf(world).verify("openai")).status).toBe(404);
    expect((await apiOf(other).verify("anthropic")).status).toBe(404);
  });
});

describe("aiProvider.remove", () => {
  it("refuse le principal (VALIDATION is_primary) ; retire le secours et détache le réglage", async () => {
    const { b, world } = await worldWith("anthropic", "openai", "google");
    const refused = await apiOf(world).remove("anthropic");
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe("VALIDATION");
    expect(refused.body.data).toEqual({ field: "provider", message: "is_primary" });
    expect(await sealedRows(b.database, orgOf(world))).toHaveLength(3);

    const removed = await apiOf(world).remove("openai");
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ removed: true });
    expect((await settingsRows(b.database, orgOf(world)))[0]).toMatchObject({
      primary_provider: "anthropic",
      fallback_provider: null,
    });
    expect((await apiOf(world).remove("google")).status).toBe(200);
    expect((await apiOf(world).remove("google")).status).toBe(404);
    expect(await auditActions(b.database, orgOf(world))).toContain("ai_provider.remove");
  });

  it("ses lignes d'usage partent en cascade ; la consommation passée est gardée", async () => {
    const { b, world } = await worldWith("anthropic", "openai");
    expect(
      (await apiOf(world).setUsage("idea_space", { provider: "openai", model: "openai-qualifie" }))
        .status,
    ).toBe(200);
    await insertUsage(b.database, orgOf(world), {
      month: "2026-10",
      provider: "openai",
      calls: 3,
      costMicroUsd: 500,
    });

    expect((await apiOf(world).remove("openai")).status).toBe(200);

    expect(await usageModelRows(b.database, orgOf(world))).toEqual([]);
    const report = await apiOf(world).report("?month=2026-10");
    expect(report.body.providers).toEqual([
      expect.objectContaining({ provider: "openai", costMicroUsd: 500 }),
    ]);
  });

  it("clé d'une autre organisation : 404, la clé n'est pas touchée", async () => {
    const { b, world } = await worldWith("anthropic");
    const other = await createWorld(b.database);
    expect((await apiOf(other).remove("anthropic")).status).toBe(404);
    expect(await sealedRows(b.database, orgOf(world))).toHaveLength(1);
  });
});

describe("aiProvider.setPrimary", () => {
  it("échange avec le secours ; sinon le secours reste ; idempotent sur le principal", async () => {
    const { b, world } = await worldWith("anthropic", "openai", "google");

    const swapped = await apiOf(world).setPrimary("openai");
    expect(swapped.status, JSON.stringify(swapped.body)).toBe(200);
    expect(swapped.body).toMatchObject({ provider: "openai", role: "primary" });
    expect((await settingsRows(b.database, orgOf(world)))[0]).toMatchObject({
      primary_provider: "openai",
      fallback_provider: "anthropic",
    });

    expect((await apiOf(world).setPrimary("google")).status).toBe(200);
    expect((await settingsRows(b.database, orgOf(world)))[0]).toMatchObject({
      primary_provider: "google",
      fallback_provider: "anthropic",
    });
    const audits = (await auditActions(b.database, orgOf(world))).filter(
      (a) => a === "ai_provider.setPrimary",
    );
    expect(audits).toHaveLength(2);

    expect((await apiOf(world).setPrimary("google")).status).toBe(200);
    expect(
      (await auditActions(b.database, orgOf(world))).filter((a) => a === "ai_provider.setPrimary"),
    ).toHaveLength(2);
  });

  it("clé invalidée : 422 ; fournisseur sans clé : 404 ; rien ne change", async () => {
    const { b, world } = await worldWith("anthropic", "openai");
    await b.database.query(
      "UPDATE llm_provider_credentials SET invalidated_at = now() WHERE organization_id = $1 AND provider = 'openai'",
      [orgOf(world)],
    );
    const before = await settingsRows(b.database, orgOf(world));

    const invalid = await apiOf(world).setPrimary("openai");
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe("VALIDATION");
    expect((await apiOf(world).setPrimary("google")).status).toBe(404);
    expect(await settingsRows(b.database, orgOf(world))).toEqual(before);
  });
});
