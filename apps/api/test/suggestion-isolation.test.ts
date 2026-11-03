import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { shapeOf } from "./helpers/client-scene.ts";
import { count } from "./helpers/organizations.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createSuggestionScene,
  type SuggestionScene,
  suggestionApi,
  suggestionRows,
  UNKNOWN_ID,
} from "./helpers/suggestions.ts";

/**
 * TK-55c : cloisonnement de `suggestion.*` (TK-55a l'impose centralement). Un client n'atteint que
 * ses projets liés ; tout autre cas est un 404 au corps identique (aucun oracle d'existence), entre
 * clients d'une même organisation comme entre organisations. Un identifiant de suggestion d'un autre
 * projet utilisé avec le projet de l'appelant est un 404 aussi.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SuggestionScene;
let secretId: string;
beforeEach(async () => {
  scene = await createSuggestionScene(bench());
  const created = await suggestionApi(bench().app, scene.c2).create(scene.p2.projectId, {
    body: "SECRET-P2",
  });
  secretId = created.body.id;
});

const as = (actor: { cookie: string }) => suggestionApi(bench().app, actor);
const p1 = () => scene.p1.projectId;
const p2 = () => scene.p2.projectId;
const foreignOwner = () => scene.foreign.world.actors.owner;

/** Toutes les procédures sur un projet donné, avec l'identifiant de la suggestion secrète de p2. */
async function everything(actor: { cookie: string }, projectId: string, id = secretId) {
  const api = as(actor);
  return [
    await api.create(projectId),
    await api.createFeature(projectId, "F-001"),
    await api.list(projectId),
    await api.withdraw(projectId, id),
    await api.accept(projectId, id),
    await api.reject(projectId, id),
  ];
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("un client n'atteint que son projet lié", () => {
  it.each([
    ["un autre projet de la même organisation", () => p2()],
    ["un projet d'une autre organisation", () => scene.foreign.projectId],
    ["un projet inexistant", () => UNKNOWN_ID],
  ])("c1 sur %s : 404 NOT_FOUND sur create, list et withdraw", async (_label, projectId) => {
    const api = as(scene.c1);
    const calls = [
      await api.create(projectId()),
      await api.list(projectId()),
      await api.withdraw(projectId(), secretId),
    ];

    for (const res of calls) {
      expect(res.status, JSON.stringify(res.body)).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
  });

  it("client sans lien : tout est 404 sur p1 comme sur p2", async () => {
    const api = as(scene.c3);
    for (const projectId of [p1(), p2()]) {
      for (const res of [await api.create(projectId), await api.list(projectId)]) {
        expect(res.status).toBe(404);
        expect(res.body.code).toBe("NOT_FOUND");
      }
    }
  });

  it("404 uniforme : mêmes statut et corps pour non lié, étranger, inexistant et sans lien", async () => {
    const shapes = [
      await as(scene.c1).list(p2()),
      await as(scene.c1).list(scene.foreign.projectId),
      await as(scene.c1).list(UNKNOWN_ID),
      await as(scene.c3).list(p1()),
    ].map(shapeOf);

    for (const shape of shapes) expect(shape).toEqual(shapes[0]);
    expect(shapes[0]).toMatchObject({ status: 404, body: { code: "NOT_FOUND" } });
  });

  it("un lien supprimé coupe l'accès aussitôt (relu à chaque requête)", async () => {
    expect((await as(scene.c1).list(p1())).status).toBe(200);
    await bench().database.query("DELETE FROM project_client_access WHERE user_id = $1", [
      scene.c1.userId,
    ]);

    expect((await as(scene.c1).list(p1())).status).toBe(404);
    expect((await as(scene.c1).create(p1())).status).toBe(404);
  });

  it("aucune écriture dans p2 par c1 : aucune ligne, aucune notification de plus", async () => {
    const notifications = await count(bench().database, "notifications");

    await everything(scene.c1, p2());

    expect(await suggestionRows(bench().database, p2())).toHaveLength(1);
    expect((await suggestionRows(bench().database, p2()))[0]?.status).toBe("open");
    expect(await count(bench().database, "notifications")).toBe(notifications);
  });
});

describe("un identifiant d'un autre projet utilisé avec mon projet : 404", () => {
  it.each(["withdraw", "accept", "reject"] as const)(
    "%s : l'identifiant de p2 sous le chemin de p1 (propriétaire de p1 comprise)",
    async (action) => {
      const owner = scene.p1.world.actors.owner;
      const own = await suggestionApi(bench().app, scene.p1.world.actors.owner).create(p1());

      const crossed = await as(owner)[action](p1(), secretId);
      const unknown = await as(owner)[action](p1(), UNKNOWN_ID);

      expect(crossed.status, JSON.stringify(crossed.body)).toBe(404);
      expect(shapeOf(crossed)).toEqual(shapeOf(unknown));
      expect((await suggestionRows(bench().database, p2()))[0]?.status).toBe("open");
      expect(own.status).toBe(200);
    },
  );
});

describe("organisations : le propriétaire d'une autre organisation n'a aucune prise", () => {
  it("404 uniforme sur chaque procédure, aucun oracle, rien d'écrit", async () => {
    const calls = await everything(foreignOwner(), p1());

    for (const res of calls) {
      expect(res.status, JSON.stringify(res.body)).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    expect(new Set(calls.map((res) => JSON.stringify(shapeOf(res)))).size).toBe(1);
    expect(await suggestionRows(bench().database, p1())).toHaveLength(0);
  });

  it("une suggestion d'une autre organisation n'est pas listée même avec son projectId en clair", async () => {
    const seeded = await as(foreignOwner()).create(scene.foreign.projectId, {
      body: "SECRET-ETRANGER",
    });
    expect(seeded.status, JSON.stringify(seeded.body)).toBe(200);

    for (const actor of [scene.c1, scene.p1.world.actors.owner]) {
      const res = await as(actor).list(p1());
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain("SECRET");
    }
  });
});

describe("rôles d'équipe et business : toute leur organisation, jamais une autre", () => {
  it.each(["owner", "admin", "dev", "designer", "business"] as const)(
    "%s liste p1 et p2 sans lien, 404 sur le projet étranger",
    async (role) => {
      const actor = scene.p1.world.actors[role];

      for (const projectId of [p1(), p2()]) {
        expect((await as(actor).list(projectId)).status, role).toBe(200);
      }
      expect((await as(actor).list(scene.foreign.projectId)).status, role).toBe(404);
    },
  );
});
