import * as Sentry from "@sentry/node";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { llmBench, PROVIDER, ROUTE, worldOf } from "./helpers/llm-credential-routes.ts";
import { containsSecret, makeSentinel } from "./helpers/llm-credentials.ts";

vi.mock("@sentry/node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sentry/node")>()),
  captureException: vi.fn(),
}));

/**
 * TK-52 revue de sécurité : un corps de requête que l'analyseur refuse (JSON tronqué ou mal formé,
 * trop gros, mauvais Content-Type, trop profond) ne doit jamais renvoyer ni journaliser un extrait
 * du corps, donc de la clé saisie. La réponse suit le format d'erreur du contrat.
 */
const bench = llmBench({ beforeAll, afterAll, beforeEach });
const secret = makeSentinel();

beforeEach(() => {
  vi.clearAllMocks();
});

const flat = (value: unknown): string => JSON.stringify(value) ?? "";

async function put(
  contentType: string | undefined,
  payload: string,
  path = `${ROUTE}/${PROVIDER}`,
  method: "put" | "post" = "put",
) {
  const b = bench();
  const world = await worldOf(b);
  const req = request(b.app.getHttpServer())[method](path).set("Cookie", world.actors.owner.cookie);
  if (contentType) req.set("Content-Type", contentType);
  const stdout: string[] = [];
  const spies = [process.stdout, process.stderr].map((stream) =>
    vi.spyOn(stream, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    }),
  );
  let res: request.Response;
  try {
    res = await req.send(payload);
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  const captured = [
    b.lines.join("\n"),
    stdout.join("\n"),
    flat(
      vi
        .mocked(Sentry.captureException)
        .mock.calls.map(([e, c]) => [String(e), (e as Error)?.stack, (e as Error)?.cause, c]),
    ),
  ].join("\n");
  return { res, captured, b, world };
}

function expectClean(res: request.Response, captured: string) {
  expect(containsSecret(flat(res.body), secret), flat(res.body)).toBe(false);
  expect(containsSecret(flat(res.headers), secret)).toBe(false);
  expect(containsSecret(res.text, secret), res.text).toBe(false);
  expect(containsSecret(captured, secret), captured).toBe(false);
  expect(res.text).not.toMatch(/Unexpected token|is not valid JSON|SyntaxError|position \d+/);
  expect(captured).not.toMatch(/Unexpected token|is not valid JSON|position \d+/);
}

describe("corps JSON mal formé : aucun extrait du corps ne sort", () => {
  it.each([
    ["tronqué", `{"provider":"${PROVIDER}","apiKey":"${secret}`],
    ["guillemet manquant", `{"provider":"${PROVIDER}","apiKey":${secret}}`],
    ["virgule finale", `{"provider":"${PROVIDER}","apiKey":"${secret}",}`],
    ["début erroné", `${secret}{"apiKey":"x"}`],
    ["corps nu", secret],
  ])("%s : 400 propre au format du contrat", async (_name, payload) => {
    const { res, captured } = await put("application/json", payload);
    expect(res.status, res.text).toBe(400);
    expect(res.body).toMatchObject({ defined: false, status: 400 });
    expect(typeof res.body.code).toBe("string");
    expectClean(res, captured);
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
  });

  it("les autres routes à corps (POST invalidate) : même garantie", async () => {
    const { res, captured } = await put(
      "application/json",
      `{"provider":"${secret}`,
      `${ROUTE}/${PROVIDER}/invalidate`,
      "post",
    );
    expect(res.status, res.text).toBe(400);
    expectClean(res, captured);
  });

  it("aucune ligne n'est écrite", async () => {
    const { b, world } = await put("application/json", `{"apiKey":"${secret}`);
    const rows = await b.database.query(
      "SELECT 1 FROM llm_provider_credentials WHERE organization_id = $1",
      [world.organizationId],
    );
    expect(rows).toHaveLength(0);
  });
});

describe("autres refus de l'analyseur", () => {
  it("corps trop gros : 413 sans extrait", async () => {
    const { res, captured } = await put(
      "application/json",
      `{"apiKey":"${secret}${"z".repeat(2 * 1024 * 1024)}"}`,
    );
    expect(res.status, res.text).toBe(413);
    expectClean(res, captured);
  });

  it("Content-Type erroné : 415 ou 400/422, sans extrait", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "application/xml"]) {
      const { res, captured } = await put(type, `{"provider":"${PROVIDER}","apiKey":"${secret}"}`);
      expect([400, 415, 422], `${type} ${res.text}`).toContain(res.status);
      expectClean(res, captured);
    }
  });

  it("JSON valide mais profondément imbriqué ou à clé dupliquée : refus sans écho", async () => {
    const deep = `${"[".repeat(5000)}"${secret}"${"]".repeat(5000)}`;
    const duplicated = `{"apiKey":"${secret}","apiKey":"${secret}-2","provider":"${PROVIDER}"}`;
    for (const payload of [deep, `{"apiKey":${deep}}`, duplicated]) {
      const { res, captured } = await put("application/json", payload);
      expect(res.status, res.text).toBeLessThan(600);
      expectClean(res, captured);
    }
  });

  it("charset exotique ou JSON non UTF-8 : sans écho", async () => {
    const { res, captured } = await put(
      "application/json; charset=utf-32",
      `{"apiKey":"${secret}"}`,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expectClean(res, captured);
  });
});
