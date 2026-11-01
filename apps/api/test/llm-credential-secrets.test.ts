import * as Sentry from "@sentry/node";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { llmApi, llmBench, PROVIDER, worldOf } from "./helpers/llm-credential-routes.ts";
import { containsSecret, makeSentinel } from "./helpers/llm-credentials.ts";

vi.mock("@sentry/node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sentry/node")>()),
  captureException: vi.fn(),
}));

/**
 * TK-52b NON-FUITE (modèle de repo-secrets) : la clé sentinelle (clairement factice, construite à
 * l'exécution) n'apparaît dans AUCUNE réponse HTTP (succès comme chaque erreur), l'OpenAPI, les
 * journaux de l'application, ce que reçoit Sentry, la base (hors colonne chiffrée, qui est du
 * chiffré) ni l'audit. Une fuite partielle (début, fin, base64, hex) compte aussi.
 */
const bench = llmBench({ beforeAll, afterAll, beforeEach });
const secret = makeSentinel();
const MODEL = "modele-distinctif-52b";

beforeEach(() => {
  vi.clearAllMocks();
});

const flat = (value: unknown): string => JSON.stringify(value) ?? "";

async function database(b: ReturnType<typeof bench>, organizationId: string): Promise<string> {
  const rows = await b.database.query<{ text: string }>(
    `SELECT row_to_json(c)::text AS text FROM llm_provider_credentials c WHERE organization_id = $1
     UNION ALL SELECT row_to_json(a)::text FROM audit_log a WHERE organization_id = $1`,
    [organizationId],
  );
  return rows.map((row) => row.text).join("\n");
}

function everythingCaptured(b: ReturnType<typeof bench>): string {
  return [
    b.lines.join("\n"),
    flat(
      vi
        .mocked(Sentry.captureException)
        .mock.calls.map(([e, c]) => [String(e), (e as Error)?.stack, (e as Error)?.cause, c]),
    ),
  ].join("\n");
}

describe("succès : la clé ne ressort jamais", () => {
  it("set, list, invalidate, remove : réponses, OpenAPI, journaux, Sentry, base et audit", async () => {
    const b = bench();
    const world = await worldOf(b);
    const api = llmApi(b.app, world.actors.owner);

    const set = await api.set(PROVIDER, { apiKey: secret, defaultModel: MODEL });
    const replaced = await api.set(PROVIDER, { apiKey: `${secret}-bis`, defaultModel: MODEL });
    const listed = await api.list();
    const invalidated = await api.invalidate(PROVIDER);
    const inBase = await database(b, world.organizationId);
    const removed = await api.remove(PROVIDER);
    const openapi = await request(b.app.getHttpServer()).get("/openapi.json");

    expect(set.status, flat(set.body)).toBe(200);
    expect(replaced.status).toBe(200);
    expect(listed.status).toBe(200);
    expect(invalidated.status).toBe(200);
    expect(removed.status).toBe(200);

    const responses = flat([set, replaced, listed, invalidated, removed].map((r) => r.body));
    for (const haystack of [responses, flat(openapi.body), inBase, everythingCaptured(b)]) {
      expect(containsSecret(haystack, secret)).toBe(false);
      expect(containsSecret(haystack, `${secret}-bis`)).toBe(false);
    }
    // Les en-têtes de réponse non plus.
    expect(containsSecret(flat([set.headers, listed.headers]), secret)).toBe(false);
  });

  it("le journal de requêtes ne porte ni corps ni query (la clé voyage dans le corps du PUT)", async () => {
    const b = bench();
    const world = await worldOf(b);
    const res = await llmApi(b.app, world.actors.owner).set(PROVIDER, { apiKey: secret });
    expect(res.status, flat(res.body)).toBe(200);
    expect(b.lines.length).toBeGreaterThan(0);
    expect(containsSecret(b.lines.join("\n"), secret)).toBe(false);
    expect(b.lines.join("\n")).not.toContain("apiKey");
  });
});

describe("erreurs : ni la valeur ni ses fragments, dans la réponse comme dans les journaux", () => {
  it("422 (clé trop longue, caractère de contrôle, modèle invalide, fournisseur inconnu)", async () => {
    const b = bench();
    const world = await worldOf(b);
    const api = llmApi(b.app, world.actors.owner);
    const responses = [
      await api.set(PROVIDER, { apiKey: `${secret}${"z".repeat(600)}` }),
      await api.set(PROVIDER, { apiKey: `${secret}\u0000` }),
      await api.set(PROVIDER, { apiKey: secret, defaultModel: `${secret}/x` }),
      await api.set("fake", { apiKey: secret }),
    ];
    for (const res of responses) {
      expect(res.status, flat(res.body)).toBe(422);
      expect(containsSecret(flat(res.body), secret)).toBe(false);
    }
    expect(containsSecret(everythingCaptured(b), secret)).toBe(false);
  });
});

describe("erreurs d'accès et de serveur : ni la valeur ni ses fragments", () => {
  it("403 (dev), 401 (sans session) et 503 (sans porte-clés)", async () => {
    const b = bench();
    const world = await worldOf(b);
    const responses = [
      await llmApi(b.app, world.actors.dev).set(PROVIDER, { apiKey: secret }),
      await llmApi(b.app, undefined).set(PROVIDER, { apiKey: secret }),
      await llmApi(b.appWithoutKey, world.actors.owner).set(PROVIDER, { apiKey: secret }),
    ];
    expect(responses.map((r) => r.status)).toEqual([403, 401, 503]);
    for (const res of responses) expect(containsSecret(flat(res.body), secret)).toBe(false);
    expect(containsSecret(everythingCaptured(b), secret)).toBe(false);
  });

  it("500 (échec de l'audit dans la transaction) : INTERNAL seul, journal et Sentry sans la clé", async () => {
    const b = bench();
    const world = await worldOf(b);
    await b.database.query("INSERT INTO audit_fail (action) VALUES ('llm_credential.create')");
    const res = await llmApi(b.app, world.actors.owner).set(PROVIDER, {
      apiKey: secret,
      defaultModel: MODEL,
    });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL");
    expect(res.body.data).toEqual({ requestId: expect.any(String) });
    expect(containsSecret(flat(res.body), secret)).toBe(false);
    const captured = everythingCaptured(b);
    expect(containsSecret(captured, secret)).toBe(false);
    // Rien de ce qui touche à la ligne chiffrée ne part au SDK d'erreurs.
    expect(captured).not.toContain("Failing row");
    expect(captured).not.toContain("\\x");
    expect(await database(b, world.organizationId)).toBe("");
  });

  it("404 : remove et invalidate d'une clé absente ne citent rien", async () => {
    const b = bench();
    const world = await worldOf(b);
    const api = llmApi(b.app, world.actors.owner);
    const responses = [await api.remove(PROVIDER), await api.invalidate(PROVIDER)];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(flat(res.body)).not.toContain(PROVIDER);
    }
  });
});

describe("la base ne contient la clé qu'à l'état chiffré", () => {
  it("après set : la colonne ciphertext existe, n'est pas la clé, et la ligne entière est propre", async () => {
    const b = bench();
    const world = await worldOf(b);
    await llmApi(b.app, world.actors.owner).set(PROVIDER, { apiKey: secret });
    const [row] = await b.database.query<{
      ciphertext: Buffer;
      nonce: Buffer;
      key_version: number;
    }>(
      "SELECT ciphertext, nonce, key_version FROM llm_provider_credentials WHERE organization_id = $1",
      [world.organizationId],
    );
    expect(row?.nonce.length).toBe(12);
    expect(row?.key_version).toBe(1);
    expect(row?.ciphertext.length).toBe(Buffer.byteLength(secret, "utf8") + 16);
    expect(containsSecret(row?.ciphertext ?? Buffer.alloc(0), secret)).toBe(false);
    const text = await b.database.query<{ text: string }>(
      "SELECT c::text AS text FROM llm_provider_credentials c WHERE organization_id = $1",
      [world.organizationId],
    );
    expect(containsSecret(text[0]?.text ?? "", secret)).toBe(false);
  });
});
