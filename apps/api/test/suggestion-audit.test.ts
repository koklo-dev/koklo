import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditOf } from "./helpers/project-client.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { auditTotal } from "./helpers/spec-read.ts";
import {
  createSuggestionScene,
  type SuggestionScene,
  suggestionApi,
  suggestionRows,
} from "./helpers/suggestions.ts";

/**
 * TK-55c : audit de `suggestion.*`. Actions stables `suggestion.create|withdraw|accept|reject`,
 * `targetKind: "suggestion"`, `targetId` = id de la ligne (posé par le serveur), jamais de contenu
 * libre. Une entrée par écriture réelle ; un rejeu idempotent, un refus ou une lecture n'en
 * produisent aucune. Le scénario par procédure d'`audit-coverage.test.ts` complète ce fichier.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SuggestionScene;
beforeEach(async () => {
  scene = await createSuggestionScene(bench());
});

const p1 = () => scene.p1.projectId;
const org = () => scene.p1.organizationId;
const total = () => auditTotal(bench().database, org());
const owner = () => suggestionApi(bench().app, scene.p1.world.actors.owner);
const client = () => suggestionApi(bench().app, scene.c1);
const ACTIONS = [
  "suggestion.create",
  "suggestion.withdraw",
  "suggestion.accept",
  "suggestion.reject",
];

describe("une entrée par écriture réelle", () => {
  it("create, accept, reject et withdraw : action, cible et acteur exacts", async () => {
    const a = (await client().create(p1(), { body: "A" })).body.id;
    const b = (await client().create(p1(), { body: "B" })).body.id;
    const c = (await client().create(p1(), { body: "C" })).body.id;
    await owner().accept(p1(), a);
    await owner().reject(p1(), b);
    await client().withdraw(p1(), c);

    const entries = await auditOf(bench().database, org(), ACTIONS);

    expect(entries.map((e) => [e.action, e.target_id, e.actor_id])).toEqual([
      ["suggestion.create", a, scene.c1.userId],
      ["suggestion.create", b, scene.c1.userId],
      ["suggestion.create", c, scene.c1.userId],
      ["suggestion.accept", a, scene.p1.world.actors.owner.userId],
      ["suggestion.reject", b, scene.p1.world.actors.owner.userId],
      ["suggestion.withdraw", c, scene.c1.userId],
    ]);
    for (const entry of entries) {
      expect(entry).toMatchObject({ target_kind: "suggestion", ticket_id: null });
    }
  });
});

describe("aucune entrée sans écriture réelle", () => {
  it("lecture, rejeu, refus de rôle, cloisonnement, validation et conflit : journal inchangé", async () => {
    const id = (await client().create(p1(), { body: "Pour le journal" })).body.id;
    expect(id, "précondition : la suggestion existe").toEqual(expect.any(String));
    expect((await owner().accept(p1(), id)).status).toBe(200);
    // Le doublon n'est idempotent que tant que la suggestion est ouverte : `id` est décidée.
    expect((await client().create(p1(), { body: "Encore ouverte" })).status).toBe(200);
    const before = await total();

    await client().list(p1());
    await owner().list(p1());
    await client().create(p1(), { body: "Encore ouverte" });
    await owner().accept(p1(), id);
    await client().withdraw(p1(), id);
    await owner().reject(p1(), id);
    await suggestionApi(bench().app, scene.p1.world.actors.business).create(p1());
    await suggestionApi(bench().app, scene.p1.world.actors.designer).accept(p1(), id);
    await suggestionApi(bench().app, scene.c3).create(p1());
    await client().create(p1(), { body: "" });
    await client().createFeature(p1(), "F-999");

    expect(await total()).toBe(before);
  });
});

describe("jamais de contenu libre dans le journal", () => {
  it("corps, note et clé ne figurent dans aucune colonne d'aucune entrée", async () => {
    const created = await client().create(p1(), { body: "CORPS-SENTINELLE-AUDIT" });
    await owner().accept(p1(), created.body.id, { note: "NOTE-SENTINELLE-AUDIT" });
    const rows = await bench().database.query(
      "SELECT row_to_json(a)::text AS row FROM audit_log a WHERE organization_id = $1",
      [org()],
    );

    const text = JSON.stringify(rows);
    expect(text).not.toContain("SENTINELLE");
    expect(text).not.toContain("SG-1");
    expect(text).not.toContain(scene.headP1);
    expect((await suggestionRows(bench().database, p1()))[0]?.body).toBe("CORPS-SENTINELLE-AUDIT");
  });
});
