import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { shapeOf } from "./helpers/client-scene.ts";
import { clientSpaceApi, createSpaceScene, type SpaceScene } from "./helpers/client-space.ts";
import { count } from "./helpers/organizations.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { auditTotal, seedIndex } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-55b : cloisonnement de `clientSpace.*` (TK-55a l'impose centralement). Un client n'atteint que
 * ses projets liés ; tout autre cas est un 404 au corps identique (aucun oracle d'existence) ; les
 * rôles d'équipe et le business lisent toute leur organisation, jamais une autre. Lecture seule.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
const STAFF = ["owner", "admin", "dev", "designer", "business"] as const;
const UNKNOWN_PROJECT = "11111111-1111-4111-8111-111111111111";

let scene: SpaceScene;
beforeEach(async () => {
  scene = await createSpaceScene(bench());
  const b = bench();
  await seedIndex(b, scene.p1, [{ id: "F-001", titre: "Visible p1" }], { commit: true });
  await seedIndex(b, scene.p2, [{ id: "F-001", titre: "SECRET-P2" }], { commit: true });
  await seedIndex(b, scene.foreign, [{ id: "F-001", titre: "SECRET-ETRANGER" }], { commit: true });
});

const as = (actor: { cookie: string }) => clientSpaceApi(bench().app, actor);
const both = async (actor: { cookie: string }, projectId: string) => [
  await as(actor).features(projectId),
  await as(actor).feature(projectId, "F-001"),
];

describe("clientSpace : un client lié lit son projet et seulement lui", () => {
  it("c1 lit p1 (liste et détail), sans rien de p2", async () => {
    const [list, one] = await both(scene.c1, scene.p1.projectId);

    expect(list?.status, JSON.stringify(list?.body)).toBe(200);
    expect(one?.status, JSON.stringify(one?.body)).toBe(200);
    expect(JSON.stringify([list?.body, one?.body])).not.toContain("SECRET");
  });

  it.each([
    ["autre projet de la même organisation", () => scene.p2.projectId],
    ["projet d'une autre organisation", () => scene.foreign.projectId],
    ["projet inexistant", () => UNKNOWN_PROJECT],
  ])("c1 sur un %s : 404 NOT_FOUND, jamais 403", async (_label, projectId) => {
    for (const res of await both(scene.c1, projectId())) {
      expect(res?.status).toBe(404);
      expect(res?.body.code).toBe("NOT_FOUND");
    }
  });

  it("client sans lien : 404 sur p1 comme sur p2", async () => {
    for (const projectId of [scene.p1.projectId, scene.p2.projectId]) {
      for (const res of await both(scene.c3, projectId)) {
        expect(res?.status).toBe(404);
        expect(res?.body.code).toBe("NOT_FOUND");
      }
    }
  });

  it("404 uniforme : mêmes statut et corps pour non lié, étranger et inexistant (aucun oracle)", async () => {
    const shapes = [
      await both(scene.c1, scene.p2.projectId),
      await both(scene.c1, scene.foreign.projectId),
      await both(scene.c1, UNKNOWN_PROJECT),
      await both(scene.c3, scene.p1.projectId),
    ].map((pair) => pair.map((res) => shapeOf(res as { status: number; body: unknown })));

    for (const shape of shapes) {
      expect(shape).toEqual(shapes[0]);
      for (const part of shape) expect(part.body).toMatchObject({ code: "NOT_FOUND", status: 404 });
    }
  });

  it("un lien supprimé coupe l'accès aussitôt (relu à chaque requête)", async () => {
    expect((await as(scene.c1).features(scene.p1.projectId)).status).toBe(200);
    await bench().database.query("DELETE FROM project_client_access WHERE user_id = $1", [
      scene.c1.userId,
    ]);

    expect((await as(scene.c1).features(scene.p1.projectId)).status).toBe(404);
  });

  it("client lié à deux projets : lit les deux", async () => {
    await bench().database.query(
      `INSERT INTO project_client_access (id, organization_id, project_id, user_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), now())`,
      [scene.p1.organizationId, scene.p2.projectId, scene.c1.userId],
    );

    expect((await as(scene.c1).features(scene.p2.projectId)).status).toBe(200);
    expect((await as(scene.c1).features(scene.p1.projectId)).status).toBe(200);
  });
});

describe("clientSpace : rôles d'équipe, business et autres organisations", () => {
  it.each(STAFF)("%s lit p1 et p2 sans lien, jamais le projet étranger", async (role) => {
    const actor = scene.p1.world.actors[role];

    for (const projectId of [scene.p1.projectId, scene.p2.projectId]) {
      for (const res of await both(actor, projectId)) expect(res?.status, role).toBe(200);
    }
    for (const res of await both(actor, scene.foreign.projectId))
      expect(res?.status, role).toBe(404);
  });

  it("le propriétaire d'une autre organisation : 404 sur p1, 200 sur son projet", async () => {
    const owner = scene.foreign.world.actors.owner;

    for (const res of await both(owner, scene.p1.projectId)) expect(res?.status).toBe(404);
    expect((await as(owner).features(scene.foreign.projectId)).status).toBe(200);
  });
});

describe("clientSpace : sans session et lecture seule", () => {
  it("sans session : 401 UNAUTHORIZED sur les trois procédures", async () => {
    const paths = [
      "/client-space/projects",
      `/client-space/projects/${scene.p1.projectId}/features`,
      `/client-space/projects/${scene.p1.projectId}/features/F-001`,
    ];
    for (const path of paths) {
      const res = await send(bench().app, undefined, "get", path);
      expect(res.status, path).toBe(401);
      expect(res.body.code, path).toBe("UNAUTHORIZED");
    }
  });

  it("aucune écriture : ni audit, ni review, ni suggestion, ni notification", async () => {
    const db = bench().database;
    const org = scene.p1.organizationId;
    const tables = ["reviews", "suggestions", "notifications", "baselines"];
    const sizes = async () => [
      await auditTotal(db, org),
      ...(await Promise.all(tables.map((table) => count(db, table)))),
    ];
    const before = await sizes();

    const calls = [
      await as(scene.c1).projects(),
      ...(await both(scene.c1, scene.p1.projectId)),
      ...(await both(scene.p1.world.actors.owner, scene.p1.projectId)),
    ];
    expect(calls.map((res) => res?.status)).toEqual([200, 200, 200, 200, 200]);

    expect(await sizes()).toEqual(before);
  });
});
