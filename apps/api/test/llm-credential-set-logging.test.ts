import * as Sentry from "@sentry/node";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { ENCRYPTION_KEY } from "./helpers/installations.ts";
import { ManualClock } from "./helpers/leases.ts";
import { llmApi, PROVIDER, ROUTE } from "./helpers/llm-credential-routes.ts";
import { containsSecret, makeSentinel } from "./helpers/llm-credentials.ts";
import { createRepoApp, installAuditFailTrigger } from "./helpers/repos.ts";
import { createWorld } from "./helpers/tickets.ts";

vi.mock("@sentry/node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sentry/node")>()),
  captureException: vi.fn(),
}));

/**
 * Réglages de l'IA : le CORPS de `llmCredential.set` (la clé) n'apparaît JAMAIS dans les journaux ni dans les
 * erreurs, quel que soit le niveau de journalisation. Le niveau est poussé à `trace` (le plus bavard) et l'on
 * capture le journal applicatif, `stdout`, `stderr` et ce que reçoit Sentry, pour chaque issue de `set` : succès,
 * 422, 503, 403, 401, 500 (échec d'audit), corps mal formé, trop gros. Garde de non-régression : le journal de
 * requêtes ne porte ni corps ni query (voir `llm-credential-secrets.test.ts` pour le niveau `info`).
 */
const secret = makeSentinel();
const MODEL = "modele-distinctif-journaux";

let lines: string[];
let app: Awaited<ReturnType<typeof createRepoApp>>;
let appWithoutKey: Awaited<ReturnType<typeof createRepoApp>>;
let database: Awaited<ReturnType<typeof createSeededDatabase>>;

beforeAll(async () => {
  database = await createSeededDatabase();
  await installAuditFailTrigger(database);
  lines = [];
  const clock = new ManualClock();
  const logStream = { write: (line: string) => void lines.push(line) };
  app = await createRepoApp(database.url, {
    clock,
    encryptionKey: ENCRYPTION_KEY,
    logStream,
    config: { logLevel: "trace" },
  });
  appWithoutKey = await createRepoApp(database.url, {
    clock,
    logStream,
    config: { logLevel: "trace" },
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await appWithoutKey?.close();
  await database?.dispose();
}, 60_000);

beforeEach(async () => {
  vi.clearAllMocks();
  lines.length = 0;
  await database.query("DELETE FROM audit_fail");
});

const flat = (value: unknown): string => JSON.stringify(value) ?? "";

/** Exécute `run` en capturant stdout, stderr, le journal applicatif et Sentry. */
async function captured(run: () => Promise<unknown>): Promise<{ result: unknown; text: string }> {
  const out: string[] = [];
  const spies = [process.stdout, process.stderr].map((stream) =>
    vi.spyOn(stream, "write").mockImplementation(((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    }) as typeof stream.write),
  );
  let result: unknown;
  try {
    result = await run();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  const text = [
    lines.join("\n"),
    out.join("\n"),
    flat(
      vi
        .mocked(Sentry.captureException)
        .mock.calls.map(([e, c]) => [String(e), (e as Error)?.stack, (e as Error)?.cause, c]),
    ),
  ].join("\n");
  return { result, text };
}

function expectClean(text: string, res: request.Response) {
  expect(containsSecret(text, secret), "journaux, sorties standard ou Sentry").toBe(false);
  expect(containsSecret(res.text, secret), "réponse").toBe(false);
  expect(containsSecret(flat(res.headers), secret), "en-têtes de réponse").toBe(false);
  // Le nom du champ de la clé n'est pas non plus journalisé avec une valeur.
  expect(text).not.toMatch(/"apiKey"\s*:/);
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même route, un test par issue
describe("niveau trace : le corps du PUT n'est jamais journalisé", () => {
  it("succès (200) : le journal existe mais ne contient ni corps, ni clé, ni query", async () => {
    const world = await createWorld(database);
    const { result, text } = await captured(() =>
      llmApi(app, world.actors.owner).set(PROVIDER, { apiKey: secret, defaultModel: MODEL }),
    );
    const res = result as request.Response;
    expect(res.status, flat(res.body)).toBe(200);
    expect(lines.length).toBeGreaterThan(0);
    expectClean(text, res);
  });

  it("422 (clé trop longue, caractère de contrôle, modèle invalide, fournisseur inconnu)", async () => {
    const world = await createWorld(database);
    const api = llmApi(app, world.actors.owner);
    const { result, text } = await captured(async () => [
      await api.set(PROVIDER, { apiKey: `${secret}${"z".repeat(600)}` }),
      await api.set(PROVIDER, { apiKey: `${secret}\u0000` }),
      await api.set(PROVIDER, { apiKey: secret, defaultModel: `${secret}/x` }),
      await api.set("fake", { apiKey: secret }),
    ]);
    for (const res of result as request.Response[]) {
      expect(res.status, flat(res.body)).toBe(422);
      expectClean(text, res);
    }
  });

  it("403 (développeur), 401 (sans session), 503 (sans porte-clés)", async () => {
    const world = await createWorld(database);
    const { result, text } = await captured(async () => [
      await llmApi(app, world.actors.dev).set(PROVIDER, { apiKey: secret }),
      await llmApi(app, undefined).set(PROVIDER, { apiKey: secret }),
      await llmApi(appWithoutKey, world.actors.owner).set(PROVIDER, { apiKey: secret }),
    ]);
    const responses = result as request.Response[];
    expect(responses.map((res) => res.status)).toEqual([403, 401, 503]);
    for (const res of responses) expectClean(text, res);
  });

  it("500 (échec de l'audit dans la transaction) : INTERNAL seul, sans clé ni ligne chiffrée", async () => {
    const world = await createWorld(database);
    await database.query("INSERT INTO audit_fail (action) VALUES ('llm_credential.create')");
    const { result, text } = await captured(() =>
      llmApi(app, world.actors.owner).set(PROVIDER, { apiKey: secret, defaultModel: MODEL }),
    );
    const res = result as request.Response;
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL");
    expectClean(text, res);
    expect(text).not.toContain("Failing row");
  });

  it("corps mal formé, trop gros ou de mauvais type : aucun extrait du corps dans le journal", async () => {
    const world = await createWorld(database);
    const cookie = world.actors.owner.cookie;
    const send = (type: string, payload: string) =>
      request(app.getHttpServer())
        .put(`${ROUTE}/${PROVIDER}`)
        .set("Cookie", cookie)
        .set("Content-Type", type)
        .send(payload);
    const { result, text } = await captured(async () => [
      await send("application/json", `{"provider":"${PROVIDER}","apiKey":"${secret}`),
      await send("application/json", `{"apiKey":"${secret}${"z".repeat(2 * 1024 * 1024)}"}`),
      await send("text/plain", `{"provider":"${PROVIDER}","apiKey":"${secret}"}`),
    ]);
    for (const res of result as request.Response[]) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expectClean(text, res);
    }
  });

  it("PUT avec la clé aussi dans la query et un en-tête : le journal de requêtes les écarte (chemin seul)", async () => {
    const world = await createWorld(database);
    const { result, text } = await captured(() =>
      request(app.getHttpServer())
        .put(`${ROUTE}/${PROVIDER}?apiKey=${secret}`)
        .set("Cookie", world.actors.owner.cookie)
        .send({ provider: PROVIDER, apiKey: secret }),
    );
    // La route peut accepter ou refuser une query inattendue : dans les deux cas, elle ne doit pas être journalisée.
    expect(containsSecret(text, secret), "journaux").toBe(false);
    expect((result as request.Response).status).toBeLessThan(600);
  });
});

describe("verify : aucune clé en entrée, mais aucune fuite non plus", () => {
  it("set puis verify (fournisseur absent -> erreur propre) : journaux sans la clé", async () => {
    const world = await createWorld(database);
    const api = llmApi(app, world.actors.owner);
    const { text } = await captured(async () => {
      await api.set(PROVIDER, { apiKey: secret });
      return request(app.getHttpServer())
        .post(`${ROUTE}/${PROVIDER}/verify`)
        .set("Cookie", world.actors.owner.cookie)
        .send({ provider: PROVIDER });
    });
    expect(containsSecret(text, secret)).toBe(false);
  });
});
