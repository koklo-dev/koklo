import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedTaggedBaseline } from "./helpers/client-space.ts";
import { count } from "./helpers/organizations.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createSuggestionScene,
  type SuggestionScene,
  seedSuggestions,
  suggestionApi,
  suggestionRows,
} from "./helpers/suggestions.ts";

/**
 * TK-55c : limites de `suggestion.create`. Quotas en base (50 ouvertes par auteur et par projet, 500
 * par projet), `framing_closed` après la baseline taguée, atomicité avec l'audit.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SuggestionScene;
beforeEach(async () => {
  scene = await createSuggestionScene(bench());
});

const p1 = () => scene.p1.projectId;
const client = () => suggestionApi(bench().app, scene.c1);
const as = (role: "owner" | "dev") => suggestionApi(bench().app, scene.p1.world.actors[role]);
const rows = () => suggestionRows(bench().database, p1());
describe("quotas en base : 50 ouvertes par auteur et par projet, 500 par projet", () => {
  it("la 51e suggestion ouverte d'un auteur : 409 suggestion_quota, rien d'écrit", async () => {
    await seedSuggestions(bench().database, scene.p1, { count: 50, authorUserId: scene.c1.userId });

    const res = await client().create(p1(), { body: "Une de trop" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "CONFLICT", data: { reason: "suggestion_quota" } });
    expect(await rows()).toHaveLength(50);
  });

  it("le quota ne compte que les ouvertes de cet auteur : retirées et autre auteur passent", async () => {
    await seedSuggestions(bench().database, scene.p1, {
      count: 50,
      authorUserId: scene.c1.userId,
      status: "withdrawn",
    });
    const mine = await client().create(p1(), { body: "Après les retirées" });
    await seedSuggestions(bench().database, scene.p1, {
      count: 50,
      authorUserId: scene.c1.userId,
      from: 52,
    });

    const other = await as("dev").create(p1(), { body: "Un autre auteur" });

    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    expect(other.status, JSON.stringify(other.body)).toBe(200);
  });

  it("500 suggestions ouvertes dans le projet : tout nouvel auteur reçoit suggestion_quota", async () => {
    await seedSuggestions(bench().database, scene.p1, { count: 500, authorUserId: null });

    const res = await as("owner").create(p1(), { body: "La 501e" });

    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ reason: "suggestion_quota" });
    expect(await rows()).toHaveLength(500);
  });
});

describe("framing_closed : le client ne propose plus après baseline-0 taguée", () => {
  it.each([
    ["cible projet", (api: ReturnType<typeof suggestionApi>, id: string) => api.create(id)],
    [
      "cible feature",
      (api: ReturnType<typeof suggestionApi>, id: string) => api.createFeature(id, "F-001"),
    ],
  ])(
    "%s : 409 CONFLICT framing_closed, rien d'écrit ; l'équipe peut toujours suggérer",
    async (_label, call) => {
      expect((await call(client(), p1())).status, "avant la baseline").toBe(200);
      await seedTaggedBaseline(bench().database, scene.p1, scene.headP1);

      const closed = await call(suggestionApi(bench().app, scene.c1), p1());

      expect(closed.status).toBe(409);
      expect(closed.body).toMatchObject({ code: "CONFLICT", data: { reason: "framing_closed" } });
      expect(await rows()).toHaveLength(1);
      expect((await as("dev").create(p1(), { body: "L'équipe continue" })).status).toBe(200);
    },
  );
});

describe("atomicité : suggestion, clé, notifications et audit partagent la transaction", () => {
  it("échec d'audit : 500 INTERNAL, ni ligne, ni notification, la clé SG-1 reste libre", async () => {
    const db = bench().database;
    await db.query("INSERT INTO audit_fail (action) VALUES ('suggestion.create')");

    const failed = await client().create(p1());

    expect(failed.status).toBe(500);
    expect(failed.body.code).toBe("INTERNAL");
    expect(await rows()).toHaveLength(0);
    expect(await count(db, "notifications")).toBe(0);
    await db.query("DELETE FROM audit_fail");
    expect((await client().create(p1())).body.key).toBe("SG-1");
  });
});
