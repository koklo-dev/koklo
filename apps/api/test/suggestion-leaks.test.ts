import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedTaggedBaseline } from "./helpers/client-space.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createSuggestionScene,
  forbiddenKeys,
  HAS_SHA,
  type SuggestionScene,
  seedSuggestions,
  suggestionApi,
} from "./helpers/suggestions.ts";

/**
 * TK-55c : fuite de vocabulaire technique. Les réponses réelles de `suggestion.*` (succès et erreurs)
 * ne portent ni SHA 40 ou 64 hex, ni nom de branche, ni clé du vocabulaire git ; `outdated` est un
 * booléen, `baseSha` n'existe pas côté API publique. Le contrat est vérifié par `suggestion.test.ts`.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SuggestionScene;
beforeEach(async () => {
  scene = await createSuggestionScene(bench());
});

const p1 = () => scene.p1.projectId;
const WORLD = () => scene.p1.world.actors;

function expectClean(label: string, res: { status: number; body: unknown }) {
  const text = JSON.stringify(res.body);
  expect(text, `${label} : SHA`).not.toMatch(HAS_SHA);
  expect(text, `${label} : branche`).not.toContain("cadrage");
  expect(forbiddenKeys(res.body), `${label} : clés interdites`).toEqual([]);
}

describe("réponses de succès", () => {
  it("client : create, list, withdraw et décision lue après coup", async () => {
    const client = suggestionApi(bench().app, scene.c1);
    const owner = suggestionApi(bench().app, WORLD().owner);
    const a = await client.createFeature(p1(), "F-001", { body: "Une idée sur la connexion" });
    const b = await client.create(p1(), { body: "Une autre idée" });
    await owner.reject(p1(), a.body.id, { note: "Hors périmètre" });

    const responses = [
      a,
      b,
      await client.list(p1()),
      await client.list(p1(), "?status=rejected"),
      await client.withdraw(p1(), b.body.id),
    ];

    for (const [index, res] of responses.entries()) {
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expectClean(`client #${index}`, res);
    }
  });

  it("équipe : create, list, accept (le SHA de base ne sort pas non plus pour elle)", async () => {
    const dev = suggestionApi(bench().app, WORLD().dev);
    const created = await dev.createFeature(p1(), "F-002");

    const responses = [created, await dev.list(p1()), await dev.accept(p1(), created.body.id)];

    for (const [index, res] of responses.entries()) {
      expect(res.status).toBe(200);
      expectClean(`équipe #${index}`, res);
    }
  });
});

describe("réponses d'erreur", () => {
  function expectErrors(errors: { status: number; body: { code?: string } }[]) {
    for (const [index, res] of errors.entries()) {
      expect(res.status, `#${index} ${JSON.stringify(res.body)}`).toBeGreaterThanOrEqual(400);
      expect(res.body.code, `#${index}`).toEqual(expect.any(String));
      expectClean(`erreur #${index}`, res);
    }
  }

  it("404, 403, 409 (non ouverte), 422 et 401 sans vocabulaire technique", async () => {
    const client = suggestionApi(bench().app, scene.c1);
    const mine = await client.create(p1(), { body: "À décider" });
    await suggestionApi(bench().app, WORLD().owner).accept(p1(), mine.body.id);

    expectErrors([
      await client.createFeature(p1(), "F-999"),
      await client.create(scene.p2.projectId),
      await suggestionApi(bench().app, WORLD().business).create(p1()),
      await client.withdraw(p1(), mine.body.id),
      await client.create(p1(), { body: "" }),
      await suggestionApi(bench().app, undefined).list(p1()),
    ]);
  });

  it("409 suggestion_quota sans vocabulaire technique", async () => {
    await seedSuggestions(bench().database, scene.p1, { count: 50, authorUserId: scene.c1.userId });

    const res = await suggestionApi(bench().app, scene.c1).create(p1(), { body: "La 51e" });

    expect(res.status).toBe(409);
    expectErrors([res]);
  });

  it("409 framing_closed sans vocabulaire technique", async () => {
    await seedTaggedBaseline(bench().database, scene.p1, scene.headP1);

    const res = await suggestionApi(bench().app, scene.c1).create(p1(), { body: "Trop tard" });

    expect(res.status).toBe(409);
    expectErrors([res]);
  });
});
