import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditRowsFull } from "./helpers/comments.ts";
import {
  credentialRows,
  llmApi,
  llmBench,
  PROVIDER,
  worldOf,
} from "./helpers/llm-credential-routes.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";

/**
 * TK-52b : comportement des quatre procédures `llmCredential` (rôle owner), sur base réelle et
 * application réelle. Les rôles sont dans llm-credential-permissions, les fuites dans
 * llm-credential-secrets, l'audit dans llm-credential-audit.
 */
const bench = llmBench({ beforeAll, afterAll, beforeEach });
const secret = makeSentinel();

async function owner() {
  const b = bench();
  const world = await worldOf(b);
  return { b, world, api: llmApi(b.app, world.actors.owner) };
}

describe("set : PUT idempotent (crée ou remplace)", () => {
  it("crée : 200, statut exact sans aucun indice de la clé, une ligne en base", async () => {
    const { b, world, api } = await owner();
    const res = await api.set(PROVIDER, { apiKey: secret });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      provider: PROVIDER,
      configured: true,
      invalid: false,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    const rows = await credentialRows(b.database, world.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: PROVIDER,
      default_model: null,
      key_version: 1,
      invalidated_at: null,
      created_by_user_id: world.actors.owner.userId,
    });
  });

  it("avec un modèle par défaut : il est restitué par set et par list", async () => {
    const { api } = await owner();
    const res = await api.set(PROVIDER, { apiKey: secret, defaultModel: "un-modele-1.5" });
    expect(res.status).toBe(200);
    expect(res.body.defaultModel).toBe("un-modele-1.5");
    const listed = await api.list();
    expect(listed.body.items[0].defaultModel).toBe("un-modele-1.5");
  });
});

describe("set : remplacement", () => {
  it("deux set de suite : 200 deux fois, une seule ligne, même createdAt, chiffré remplacé", async () => {
    const { b, world, api } = await owner();
    const first = await api.set(PROVIDER, { apiKey: secret, defaultModel: "un-modele" });
    const [before] = await b.database.query<{ id: string; ciphertext: Buffer; nonce: Buffer }>(
      "SELECT id, ciphertext, nonce FROM llm_provider_credentials WHERE organization_id = $1",
      [world.organizationId],
    );
    const second = await api.set(PROVIDER, { apiKey: `${secret}-bis` });
    expect(first.status).toBe(200);
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    const rows = await b.database.query<{ id: string; ciphertext: Buffer; nonce: Buffer }>(
      "SELECT id, ciphertext, nonce FROM llm_provider_credentials WHERE organization_id = $1",
      [world.organizationId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(before?.id);
    expect(rows[0]?.nonce.equals(before?.nonce ?? Buffer.alloc(0))).toBe(false);
    expect(rows[0]?.ciphertext.equals(before?.ciphertext ?? Buffer.alloc(0))).toBe(false);
    expect(second.body.createdAt).toBe(first.body.createdAt);
    // PUT : le modèle absent du second appel est effacé.
    expect(second.body).not.toHaveProperty("defaultModel");
  });

  it("remplacer ré-arme une clé invalidée", async () => {
    const { b, world, api } = await owner();
    await api.set(PROVIDER, { apiKey: secret });
    expect((await api.invalidate(PROVIDER)).body.invalid).toBe(true);
    const res = await api.set(PROVIDER, { apiKey: `${secret}-neuve` });
    expect(res.status).toBe(200);
    expect(res.body.invalid).toBe(false);
    expect(res.body).not.toHaveProperty("invalidatedAt");
    expect((await credentialRows(b.database, world.organizationId))[0]?.invalidated_at).toBeNull();
  });

  it("un fournisseur par ligne : trois fournisseurs, trois lignes, list triée sans doublon", async () => {
    const { api } = await owner();
    for (const provider of ["anthropic", "openai", "google"]) {
      expect((await api.set(provider, { apiKey: secret })).status).toBe(200);
    }
    const listed = await api.list();
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((item: { provider: string }) => item.provider).sort()).toEqual([
      "anthropic",
      "google",
      "openai",
    ]);
  });
});

describe("set : validation (422 VALIDATION, sans la valeur, sans écriture)", () => {
  const CASES: [string, Record<string, unknown>, string][] = [
    ["clé vide", { apiKey: "" }, "apiKey"],
    ["clé blanche", { apiKey: "    " }, "apiKey"],
    ["clé de 513 caractères", { apiKey: "k".repeat(513) }, "apiKey"],
    ["clé avec un caractère de contrôle", { apiKey: `${secret}\u0007` }, "apiKey"],
    ["clé avec un saut de ligne", { apiKey: `${secret}\n${secret}` }, "apiKey"],
    ["clé absente", {}, "apiKey"],
    ["clé qui n'est pas une chaîne", { apiKey: 12345 }, "apiKey"],
    ["modèle vide", { apiKey: secret, defaultModel: "" }, "defaultModel"],
    ["modèle de 101 caractères", { apiKey: secret, defaultModel: "m".repeat(101) }, "defaultModel"],
    ["modèle avec une barre oblique", { apiKey: secret, defaultModel: "a/b" }, "defaultModel"],
    ["modèle avec deux points", { apiKey: secret, defaultModel: "a..b" }, "defaultModel"],
  ];

  it.each(CASES)("%s", async (_label, body, field) => {
    const { b, world, api } = await owner();
    const res = await api.set(PROVIDER, body);
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(res.body.data.field).toBe(field);
    expect(typeof res.body.data.message).toBe("string");
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(JSON.stringify(res.body)).not.toContain(secret.slice(0, 16));
    expect(await credentialRows(b.database, world.organizationId)).toEqual([]);
    expect(await auditRowsFull(b.database, world.organizationId)).toEqual([]);
  });

  it("accepte les bornes : clé de 512 caractères et modèle de 100", async () => {
    const { api } = await owner();
    const res = await api.set(PROVIDER, {
      apiKey: secret.padEnd(512, "x"),
      defaultModel: "m".repeat(100),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it.each(["fake", "ANTHROPIC", "mistral"])("fournisseur %s : 422 sur provider", async (name) => {
    const { b, world, api } = await owner();
    const res = await api.set(name, { apiKey: secret });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(res.body.data.field).toBe("provider");
    expect(await credentialRows(b.database, world.organizationId)).toEqual([]);
  });

  it.each([
    ["remove", (api: ReturnType<typeof llmApi>) => api.remove("fake")],
    ["invalidate", (api: ReturnType<typeof llmApi>) => api.invalidate("fake")],
  ])("%s avec un fournisseur hors liste : 422 VALIDATION", async (_name, call) => {
    const { api } = await owner();
    const res = await call(api);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
  });
});

describe("503 ENCRYPTION_UNAVAILABLE sans porte-clés", () => {
  it("set : 503 typé, sans donnée, aucune ligne ni audit ; list répond encore", async () => {
    const b = bench();
    const world = await worldOf(b);
    const api = llmApi(b.appWithoutKey, world.actors.owner);
    const res = await api.set(PROVIDER, { apiKey: secret });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("ENCRYPTION_UNAVAILABLE");
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(await credentialRows(b.database, world.organizationId)).toEqual([]);
    expect(await auditRowsFull(b.database, world.organizationId)).toEqual([]);
    const listed = await api.list();
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ items: [] });
  });

  it("le schéma du contrat est vérifié avant le service : une clé vide reste 422, même sans porte-clés", async () => {
    const b = bench();
    const world = await worldOf(b);
    const res = await llmApi(b.appWithoutKey, world.actors.owner).set(PROVIDER, { apiKey: "" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("remove et invalidate fonctionnent sans porte-clés (aucun déchiffrement)", async () => {
    const b = bench();
    const world = await worldOf(b);
    const keyed = llmApi(b.app, world.actors.owner);
    const bare = llmApi(b.appWithoutKey, world.actors.owner);
    await keyed.set("anthropic", { apiKey: secret });
    await keyed.set("openai", { apiKey: secret });
    expect((await bare.invalidate("anthropic")).status).toBe(200);
    expect((await bare.remove("openai")).status).toBe(200);
  });
});

describe("list", () => {
  it("vide : { items: [] }", async () => {
    const { api } = await owner();
    const res = await api.list();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it("statut d'une clé invalidée : invalid true et invalidatedAt, sans lastUsedAt", async () => {
    const { api } = await owner();
    await api.set(PROVIDER, { apiKey: secret });
    await api.invalidate(PROVIDER);
    const [item] = (await api.list()).body.items;
    expect(item).toMatchObject({ provider: PROVIDER, configured: true, invalid: true });
    expect(typeof item.invalidatedAt).toBe("string");
    expect(item).not.toHaveProperty("lastUsedAt");
    expect(Object.keys(item).sort()).toEqual(
      ["configured", "createdAt", "invalid", "invalidatedAt", "provider", "updatedAt"].sort(),
    );
  });
});

describe("invalidate", () => {
  it("marque la clé inutilisable sans la supprimer : 200, ligne conservée", async () => {
    const { b, world, api } = await owner();
    await api.set(PROVIDER, { apiKey: secret });
    const res = await api.invalidate(PROVIDER);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ provider: PROVIDER, configured: true, invalid: true });
    expect(typeof res.body.invalidatedAt).toBe("string");
    const rows = await credentialRows(b.database, world.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.invalidated_at).not.toBeNull();
  });

  it("idempotent : la seconde invalidation répond 200 et ne déplace pas invalidatedAt", async () => {
    const { api } = await owner();
    await api.set(PROVIDER, { apiKey: secret });
    const first = await api.invalidate(PROVIDER);
    const second = await api.invalidate(PROVIDER);
    expect(second.status).toBe(200);
    expect(second.body.invalidatedAt).toBe(first.body.invalidatedAt);
  });

  it("clé absente : 404 NOT_FOUND propre (sans donnée), aucune ligne ni audit", async () => {
    const { b, world, api } = await owner();
    const res = await api.invalidate(PROVIDER);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(await credentialRows(b.database, world.organizationId)).toEqual([]);
    expect(await auditRowsFull(b.database, world.organizationId)).toEqual([]);
  });
});

describe("remove", () => {
  it("supprime physiquement : { removed: true }, ligne absente, list vide", async () => {
    const { b, world, api } = await owner();
    await api.set(PROVIDER, { apiKey: secret });
    const res = await api.remove(PROVIDER);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ removed: true });
    expect(await credentialRows(b.database, world.organizationId)).toEqual([]);
    expect((await api.list()).body).toEqual({ items: [] });
  });

  it("ne supprime que le fournisseur visé", async () => {
    const { b, world, api } = await owner();
    await api.set("anthropic", { apiKey: secret });
    await api.set("openai", { apiKey: secret });
    await api.remove("anthropic");
    const rows = await credentialRows(b.database, world.organizationId);
    expect(rows.map((row) => row.provider)).toEqual(["openai"]);
  });

  it("clé absente, y compris la seconde suppression : 404 NOT_FOUND", async () => {
    const { api } = await owner();
    const absent = await api.remove(PROVIDER);
    expect(absent.status).toBe(404);
    expect(absent.body.code).toBe("NOT_FOUND");
    await api.set(PROVIDER, { apiKey: secret });
    expect((await api.remove(PROVIDER)).status).toBe(200);
    const again = await api.remove(PROVIDER);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe("NOT_FOUND");
  });

  it("set après remove recrée une ligne neuve", async () => {
    const { api } = await owner();
    await api.set(PROVIDER, { apiKey: secret });
    await api.remove(PROVIDER);
    const res = await api.set(PROVIDER, { apiKey: secret });
    expect(res.status).toBe(200);
    expect(res.body.invalid).toBe(false);
  });
});

describe("isolation entre organisations : l'organisation vient de la session", () => {
  it("l'organisation B ne voit, n'invalide ni ne supprime la clé de A : 404 identique à « absente »", async () => {
    const b = bench();
    const [a, other] = [await worldOf(b), await worldOf(b)];
    const apiA = llmApi(b.app, a.actors.owner);
    const apiB = llmApi(b.app, other.actors.owner);
    await apiA.set(PROVIDER, { apiKey: secret });

    expect((await apiB.list()).body).toEqual({ items: [] });
    const invalidated = await apiB.invalidate(PROVIDER);
    const removed = await apiB.remove(PROVIDER);
    expect(invalidated.status).toBe(404);
    expect(removed.status).toBe(404);
    expect(removed.body).toEqual((await apiB.remove("openai")).body);
    const rows = await credentialRows(b.database, a.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.invalidated_at).toBeNull();
  });

  it("set de B n'écrase pas la clé de A (même fournisseur) : une ligne chacune", async () => {
    const b = bench();
    const [a, other] = [await worldOf(b), await worldOf(b)];
    await llmApi(b.app, a.actors.owner).set(PROVIDER, { apiKey: secret });
    await llmApi(b.app, other.actors.owner).set(PROVIDER, { apiKey: `${secret}-B` });
    const [rowA] = await credentialRows(b.database, a.organizationId);
    const [rowB] = await credentialRows(b.database, other.organizationId);
    expect(rowA?.id).toBeDefined();
    expect(rowB?.id).toBeDefined();
    expect(rowA?.id).not.toBe(rowB?.id);
  });

  it("un organizationId dans le corps est ignoré : la ligne va dans l'organisation de la session", async () => {
    const b = bench();
    const [a, other] = [await worldOf(b), await worldOf(b)];
    const res = await llmApi(b.app, a.actors.owner).set(PROVIDER, {
      apiKey: secret,
      organizationId: other.organizationId,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await credentialRows(b.database, a.organizationId)).toHaveLength(1);
    expect(await credentialRows(b.database, other.organizationId)).toEqual([]);
    expect(res.body).not.toHaveProperty("organizationId");
  });
});

describe("atomicité : l'échec de l'audit annule l'écriture", () => {
  it.each(["llm_credential.create", "llm_credential.replace"])(
    "set (%s) : 500 INTERNAL sans ligne modifiée",
    async (action) => {
      const { b, world, api } = await owner();
      if (action.endsWith("replace")) await api.set(PROVIDER, { apiKey: secret });
      const before = await credentialRows(b.database, world.organizationId);
      await b.database.query("INSERT INTO audit_fail (action) VALUES ($1)", [action]);
      const res = await api.set(PROVIDER, { apiKey: `${secret}-x`, defaultModel: "autre" });
      expect(res.status).toBe(500);
      expect(res.body.code).toBe("INTERNAL");
      expect(JSON.stringify(res.body)).not.toContain(secret);
      expect(await credentialRows(b.database, world.organizationId)).toEqual(before);
    },
  );

  it("invalidate puis remove : 500, la clé reste valide puis présente", async () => {
    const { b, world, api } = await owner();
    await api.set(PROVIDER, { apiKey: secret });
    await b.database.query(
      "INSERT INTO audit_fail (action) VALUES ('llm_credential.invalidate'), ('llm_credential.delete')",
    );
    expect((await api.invalidate(PROVIDER)).status).toBe(500);
    expect((await api.remove(PROVIDER)).status).toBe(500);
    const rows = await credentialRows(b.database, world.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.invalidated_at).toBeNull();
  });
});
