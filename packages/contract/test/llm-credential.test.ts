import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";
import { generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, parsed, proc } from "./support.ts";

/**
 * TK-52b (contrat 0.8.0) : groupe `llmCredential` (clés BYOK). Quatre procédures, pas de `test`
 * ni de `verify` (TK-54). Aucune valeur dérivée de la clé n'est jamais exposée. Les validations
 * reproduisent exactement les CHECK SQL de `llm_provider_credentials` (la base n'est jamais le
 * premier validateur).
 */
const NAMES = ["invalidate", "list", "remove", "set", "verify"];
const INSTANT = "2026-11-02T10:00:00.000Z";
const KEY = `FAKE-KEY-NOT-REAL-${"a1".repeat(12)}`;
const STATUS = {
  provider: "anthropic",
  configured: true,
  invalid: false,
  createdAt: INSTANT,
  updatedAt: INSTANT,
};

type Doc = {
  info: { version: string };
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
};
const doc = async () => (await generateOpenApi()) as unknown as Doc;

describe("LC1 surface : exactement list, set, remove, invalidate, verify (0.9.0)", () => {
  it("le routeur expose le groupe llmCredential et rien d'autre dans ce groupe", () => {
    const group = (api.contract as unknown as Record<string, object>).llmCredential;
    expect(group).toBeDefined();
    expect(Object.keys(group ?? {}).sort()).toEqual(NAMES);
  });

  it.each([
    ["llmCredential.list", "get", "/llm-credentials"],
    ["llmCredential.set", "put", "/llm-credentials/{provider}"],
    ["llmCredential.remove", "delete", "/llm-credentials/{provider}"],
    ["llmCredential.invalidate", "post", "/llm-credentials/{provider}/invalidate"],
    ["llmCredential.verify", "post", "/llm-credentials/{provider}/verify"],
  ])("%s : %s %s dans l'OpenAPI", async (name, method, path) => {
    expect(proc(name)).toBeDefined();
    const d = await doc();
    expect(d.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });

  it("l'OpenAPI est en 0.9.0", async () => {
    expect((await doc()).info.version).toBe("0.9.0");
  });
});

describe("LC2 sortie : le statut n'a aucun indice de la clé", () => {
  it("accepte un statut minimal et un statut complet", async () => {
    expect(await isValid(output("llmCredential.set"), STATUS)).toBe(true);
    expect(
      await isValid(output("llmCredential.set"), {
        ...STATUS,
        defaultModel: "un-modele",
        invalid: true,
        invalidatedAt: INSTANT,
        lastUsedAt: INSTANT,
      }),
    ).toBe(true);
  });

  it("configured vaut toujours true", async () => {
    expect(await isValid(output("llmCredential.set"), { ...STATUS, configured: false })).toBe(
      false,
    );
  });

  it.each(["llmCredential.set", "llmCredential.invalidate"])(
    "%s : une propriété dérivée de la clé ajoutée n'est jamais conservée",
    async (name) => {
      const value = await parsed(output(name), {
        ...STATUS,
        id: "123e4567-e89b-42d3-a456-426614174000",
        keyVersion: 1,
        apiKey: KEY,
        suffix: KEY.slice(-4),
        last4: KEY.slice(-4),
        length: KEY.length,
        fingerprint: "abcd",
        ciphertext: "00",
        nonce: "00",
      });
      expect(value).toBeDefined();
      expect(Object.keys(value ?? {}).sort()).toEqual(Object.keys(STATUS).sort());
    },
  );

  it("list : { items } d'au plus trois statuts, un par fournisseur", async () => {
    expect(await isValid(output("llmCredential.list"), { items: [] })).toBe(true);
    expect(await isValid(output("llmCredential.list"), { items: [STATUS] })).toBe(true);
    const four = Array.from({ length: 4 }, () => STATUS);
    expect(await isValid(output("llmCredential.list"), { items: four })).toBe(false);
  });

  it("remove : { removed: true }", async () => {
    expect(await isValid(output("llmCredential.remove"), { removed: true })).toBe(true);
    expect(await isValid(output("llmCredential.remove"), { removed: false })).toBe(false);
  });

  it("les schémas de sortie du document OpenAPI n'ont aucune propriété apiKey/keyVersion/ciphertext", async () => {
    const text = JSON.stringify((await doc()).paths["/llm-credentials"]);
    for (const name of ["apiKey", "keyVersion", "ciphertext", "nonce", "fingerprint", "last4"]) {
      expect(text, name).not.toContain(`"${name}"`);
    }
  });
});

describe("LC3 entrée de set : mêmes règles que les CHECK SQL", () => {
  const set = (over: Record<string, unknown>) =>
    isValid(input("llmCredential.set"), { provider: "anthropic", apiKey: KEY, ...over });

  it("accepte une clé valide, avec ou sans modèle par défaut", async () => {
    expect(await set({})).toBe(true);
    expect(await set({ defaultModel: "un-modele-1.5" })).toBe(true);
  });
});

describe("LC3b entrée de set : clé, modèle, fournisseur", () => {
  const set = (over: Record<string, unknown>) =>
    isValid(input("llmCredential.set"), { provider: "anthropic", apiKey: KEY, ...over });

  it("clé : 1 à 512 caractères, sans caractère de contrôle, non vide après trim", async () => {
    expect(await set({ apiKey: "k" })).toBe(true);
    expect(await set({ apiKey: "k".repeat(512) })).toBe(true);
    expect(await set({ apiKey: "k".repeat(513) })).toBe(false);
    expect(await set({ apiKey: "" })).toBe(false);
    expect(await set({ apiKey: "   " })).toBe(false);
    expect(await set({ apiKey: `${KEY}\u0000` })).toBe(false);
    expect(await set({ apiKey: `${KEY}\n` })).toBe(false);
    expect(await set({ apiKey: `ab\u007fcd` })).toBe(false);
    expect(await set({ apiKey: 42 })).toBe(false);
    expect(await set({ apiKey: undefined })).toBe(false);
  });

  it("modèle par défaut : 1 à 100 caractères, sans « / » ni « .. »", async () => {
    expect(await set({ defaultModel: "m".repeat(100) })).toBe(true);
    expect(await set({ defaultModel: "m".repeat(101) })).toBe(false);
    expect(await set({ defaultModel: "" })).toBe(false);
    expect(await set({ defaultModel: "a/b" })).toBe(false);
    expect(await set({ defaultModel: "a..b" })).toBe(false);
    expect(await set({ defaultModel: "a.b" })).toBe(true);
  });

  it("fournisseur : anthropic, openai, google ; jamais fake ni une valeur libre", async () => {
    for (const provider of ["anthropic", "openai", "google"]) {
      expect(await set({ provider }), provider).toBe(true);
    }
    for (const provider of ["fake", "", "ANTHROPIC", "mistral", 1]) {
      expect(await set({ provider }), String(provider)).toBe(false);
    }
  });

  it.each(["remove", "invalidate"])("%s n'accepte qu'un fournisseur connu", async (name) => {
    const schema = input(`llmCredential.${name}`);
    expect(await isValid(schema, { provider: "openai" })).toBe(true);
    expect(await isValid(schema, { provider: "fake" })).toBe(false);
  });

  it("aucun identifiant d'organisation n'est conservé : elle vient de la session", async () => {
    const value = await parsed(input("llmCredential.set"), {
      provider: "anthropic",
      apiKey: KEY,
      organizationId: "123e4567-e89b-42d3-a456-426614174000",
    });
    expect(value).toBeDefined();
    expect(value).not.toHaveProperty("organizationId");
  });

  it("les messages de validation ne reprennent jamais la valeur refusée", async () => {
    const schema = input("llmCredential.set") as unknown as {
      "~standard": { validate(v: unknown): Promise<{ issues?: { message: string }[] }> };
    };
    for (const apiKey of [`${KEY}${"z".repeat(600)}`, `${KEY}\u0000`]) {
      const result = await schema["~standard"].validate({ provider: "anthropic", apiKey });
      expect(result.issues?.length).toBeGreaterThan(0);
      expect(JSON.stringify(result.issues)).not.toContain(KEY.slice(0, 16));
    }
  });
});

describe("LC4 erreurs typées", () => {
  it("set : VALIDATION 422, ENCRYPTION_UNAVAILABLE 503 sans donnée, FORBIDDEN, UNAUTHORIZED, INTERNAL", () => {
    const e = errors("llmCredential.set");
    expect(e.VALIDATION?.status).toBe(422);
    expect(e.ENCRYPTION_UNAVAILABLE?.status).toBe(503);
    expect(e.ENCRYPTION_UNAVAILABLE?.data).toBeUndefined();
    expect(e.FORBIDDEN?.status).toBe(403);
    expect(e.UNAUTHORIZED?.status).toBe(401);
    expect(e.INTERNAL?.status).toBe(500);
    expect(e.NOT_FOUND).toBeUndefined();
  });

  it.each(["remove", "invalidate"])("%s : NOT_FOUND 404 et VALIDATION, pas de 503", (name) => {
    const e = errors(`llmCredential.${name}`);
    expect(e.NOT_FOUND?.status).toBe(404);
    expect(e.VALIDATION?.status).toBe(422);
    expect(e.FORBIDDEN?.status).toBe(403);
    expect(e.UNAUTHORIZED?.status).toBe(401);
    expect(e.ENCRYPTION_UNAVAILABLE).toBeUndefined();
  });

  it("list : lecture seule en base, ni 503 (aucun déchiffrement) ni 404 ni 422", () => {
    const e = errors("llmCredential.list");
    expect(e.FORBIDDEN?.status).toBe(403);
    expect(e.UNAUTHORIZED?.status).toBe(401);
    expect(e.INTERNAL?.status).toBe(500);
    expect(e.ENCRYPTION_UNAVAILABLE).toBeUndefined();
    expect(e.NOT_FOUND).toBeUndefined();
    expect(e.VALIDATION).toBeUndefined();
  });

  it("le 503 de set est décrit dans l'OpenAPI ; remove et invalidate décrivent le 404", async () => {
    const d = await doc();
    expect(Object.keys(d.paths["/llm-credentials/{provider}"]?.put?.responses ?? {})).toContain(
      "503",
    );
    expect(Object.keys(d.paths["/llm-credentials/{provider}"]?.delete?.responses ?? {})).toContain(
      "404",
    );
    expect(
      Object.keys(d.paths["/llm-credentials/{provider}/invalidate"]?.post?.responses ?? {}),
    ).toContain("404");
  });
});

describe("LC5 exemples OpenAPI : aucune chaîne ressemblant à une vraie clé", () => {
  it("le document ne contient ni sk-ant, ni sk- suivi d'une longue suite, ni AIza", async () => {
    const text = JSON.stringify(await doc());
    expect(text).not.toMatch(/sk-ant/i);
    expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
    expect(text).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });
});
