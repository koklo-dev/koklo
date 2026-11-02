import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_AUTH_URL } from "./helpers/app.ts";
import {
  credentialRows,
  llmBench,
  PROVIDER,
  ROUTE,
  worldOf,
} from "./helpers/llm-credential-routes.ts";
import { containsSecret, makeSentinel } from "./helpers/llm-credentials.ts";

/**
 * Réglages de l'IA, CSRF (S-ai-settings §9, analyse §4) : la session voyage par cookie. Une écriture de clé
 * (`llmCredential.set`, et les autres écritures de la même route) portée par une origine étrangère doit être
 * REFUSÉE (403) sans rien écrire, même avec un cookie de session valide et un corps JSON correct. L'origine de
 * confiance (`BETTER_AUTH_URL`) et l'absence d'en-tête `Origin` (appel serveur à serveur, même origine stricte
 * du navigateur sur GET) restent acceptées.
 *
 * Si ce test échoue : le Green ajoute le contrôle d'origine (en-tête `Origin` / `Sec-Fetch-Site`) sur les
 * écritures `llmCredential.*` ; il ne doit pas casser les appels sans `Origin`.
 */
const bench = llmBench({ beforeAll, afterAll, beforeEach });
const secret = makeSentinel();
const FOREIGN = "https://evil.example";

async function put(headers: Record<string, string>, apiKey = secret) {
  const b = bench();
  const world = await worldOf(b);
  const res = await request(b.app.getHttpServer())
    .put(`${ROUTE}/${PROVIDER}`)
    .set("Cookie", world.actors.owner.cookie)
    .set(headers)
    .send({ provider: PROVIDER, apiKey });
  return { res, b, world };
}

describe("origine étrangère : set refusé, rien d'écrit", () => {
  it.each([
    ["Origin étranger", { Origin: FOREIGN }],
    ["Origin étranger avec Referer étranger", { Origin: FOREIGN, Referer: `${FOREIGN}/page` }],
    ["Origin « null » (iframe sandboxée, document local)", { Origin: "null" }],
    [
      "sous-domaine voisin de l'origine de confiance",
      { Origin: "http://localhost:3000.evil.example" },
    ],
    ["même hôte, autre port", { Origin: "http://localhost:9999" }],
    ["autre schéma", { Origin: "https://localhost:3000" }],
    ["Sec-Fetch-Site: cross-site", { "Sec-Fetch-Site": "cross-site" }],
  ])("%s : 403 et aucune ligne", async (_name, headers) => {
    const { res, b, world } = await put(headers);
    expect(res.status, res.text).toBe(403);
    expect(await credentialRows(b.database, world.organizationId)).toHaveLength(0);
    expect(containsSecret(res.text, secret)).toBe(false);
  });

  it("le refus ne répète ni la clé ni l'origine reçue", async () => {
    const { res } = await put({ Origin: FOREIGN });
    expect(res.text).not.toContain("evil.example");
    expect(containsSecret(JSON.stringify(res.headers), secret)).toBe(false);
  });

  it("les autres écritures de la route sont protégées de la même façon (invalidate, remove)", async () => {
    const b = bench();
    const world = await worldOf(b);
    const cookie = world.actors.owner.cookie;
    const agent = () => request(b.app.getHttpServer());
    // La clé existe (écrite sans en-tête d'origine) : les écritures étrangères ne doivent pas la toucher.
    const seed = await agent()
      .put(`${ROUTE}/${PROVIDER}`)
      .set("Cookie", cookie)
      .send({ provider: PROVIDER, apiKey: secret });
    expect(seed.status, seed.text).toBe(200);
    const invalidate = await agent()
      .post(`${ROUTE}/${PROVIDER}/invalidate`)
      .set("Cookie", cookie)
      .set("Origin", FOREIGN)
      .send({ provider: PROVIDER });
    const remove = await agent()
      .delete(`${ROUTE}/${PROVIDER}`)
      .set("Cookie", cookie)
      .set("Origin", FOREIGN);
    expect([invalidate.status, remove.status]).toEqual([403, 403]);
    const rows = await credentialRows(b.database, world.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.invalidated_at).toBeNull();
  });
});

describe("origines acceptées (non-régression)", () => {
  it("l'origine de confiance (BETTER_AUTH_URL) : set réussit", async () => {
    const { res, b, world } = await put({ Origin: TEST_AUTH_URL });
    expect(res.status, res.text).toBe(200);
    expect(await credentialRows(b.database, world.organizationId)).toHaveLength(1);
  });

  it("même origine signalée par le navigateur (Sec-Fetch-Site: same-origin) : set réussit", async () => {
    const { res } = await put({ Origin: TEST_AUTH_URL, "Sec-Fetch-Site": "same-origin" });
    expect(res.status, res.text).toBe(200);
  });

  it("sans en-tête Origin (appel d'un client non navigateur) : set réussit, la garde ne casse pas les tests ni les outils", async () => {
    const { res } = await put({});
    expect(res.status, res.text).toBe(200);
  });
});

describe("lectures", () => {
  it("list avec une origine étrangère ne renvoie jamais la clé (GET sans effet de bord)", async () => {
    const b = bench();
    const world = await worldOf(b);
    await request(b.app.getHttpServer())
      .put(`${ROUTE}/${PROVIDER}`)
      .set("Cookie", world.actors.owner.cookie)
      .send({ provider: PROVIDER, apiKey: secret });
    const res = await request(b.app.getHttpServer())
      .get(ROUTE)
      .set("Cookie", world.actors.owner.cookie)
      .set("Origin", FOREIGN);
    expect(containsSecret(res.text, secret)).toBe(false);
  });
});
