import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { shapeOf } from "./helpers/client-scene.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createReviewScene,
  type ReviewScene,
  reviewApi,
  reviewRows,
  seedProposedBaseline,
} from "./helpers/reviews.ts";
import { UNKNOWN_ID } from "./helpers/suggestions.ts";

/**
 * TK-55d : cloisonnement. Un client n'atteint que ses projets liés ; tout autre cas (autre projet, client
 * sans lien, autre organisation, projet inconnu) est le même 404 NOT_FOUND, sans oracle. Une cible d'un
 * autre projet n'existe pas dans celui-ci, et `repo_id` est toujours le dépôt porteur du projet.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
});
const p1 = () => scene.p1.projectId;
const db = () => bench().database;

describe("404 uniforme", () => {
  it("client d'un autre projet, sans lien, d'une autre organisation, projet inconnu : même réponse", async () => {
    const reference = shapeOf(await reviewApi(bench().app, scene.c3).submit(p1(), scene.headP1));
    const attempts = [
      await reviewApi(bench().app, scene.c2).submit(p1(), scene.headP1),
      await reviewApi(bench().app, scene.foreign.world.actors.client).submit(p1(), scene.headP1),
      await reviewApi(bench().app, scene.c1).submit(UNKNOWN_ID, scene.headP1),
      await reviewApi(bench().app, scene.c1).submit(scene.foreign.projectId, scene.headP1),
    ];

    expect(reference).toMatchObject({ status: 404, body: { code: "NOT_FOUND" } });
    for (const res of attempts) expect(shapeOf(res)).toEqual(reference);
    expect(await reviewRows(db(), p1())).toHaveLength(0);
  });

  it("c2 valide son propre projet, pas celui de c1 ; c1 inversement", async () => {
    const own = await reviewApi(bench().app, scene.c2).submit(scene.p2.projectId, scene.headP2, {
      targetRef: "F-009",
    });
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    const cross = await reviewApi(bench().app, scene.c1).submit(scene.p2.projectId, scene.headP2, {
      targetRef: "F-009",
    });
    expect(cross.status).toBe(404);
  });

  it("un client dont le lien est retiré perd l'accès avec sa session existante", async () => {
    await db().query("DELETE FROM project_client_access WHERE user_id = $1", [scene.c1.userId]);
    expect((await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP1)).status).toBe(404);
  });
});

describe("cibles et dépôt d'un autre projet", () => {
  it("une feature de p2 sous p1 : 404 ; une baseline de p2 sous p1 : 404", async () => {
    await seedProposedBaseline(db(), scene.p2, scene.headP2);
    const feature = await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP1, {
      targetRef: "F-009",
    });
    const baseline = await reviewApi(bench().app, scene.c1).submitBaseline(p1(), scene.headP1);

    expect(feature.status).toBe(404);
    expect(baseline.status).toBe(404);
  });

  it("la tête d'un autre projet de l'organisation comme version : STALE_VERSION, rien d'écrit", async () => {
    const res = await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP2);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STALE_VERSION");
  });

  it("repo_id forgé vers le dépôt de p2 : la review porte le dépôt de p1, jamais celui de p2", async () => {
    await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP1, { repoId: scene.p2.repoId });
    const all = await db().query<{ repo_id: string }>(
      "SELECT repo_id FROM reviews WHERE organization_id = $1",
      [scene.p1.organizationId],
    );

    expect(all.map((r) => r.repo_id)).toEqual([scene.p1.repoId]);
    expect(scene.p1.repoId).not.toBe(scene.p2.repoId);
  });
});

describe("review.list", () => {
  it("l'équipe d'une autre organisation, un projet inconnu : 404 identique ; le journal de p2 n'apparaît pas sous p1", async () => {
    await reviewApi(bench().app, scene.c2).submit(scene.p2.projectId, scene.headP2, {
      targetRef: "F-009",
    });
    const owner = reviewApi(bench().app, scene.p1.world.actors.owner);
    const foreign = reviewApi(bench().app, scene.foreign.world.actors.owner);

    const unknown = shapeOf(await owner.list(UNKNOWN_ID));
    expect(unknown).toMatchObject({ status: 404, body: { code: "NOT_FOUND" } });
    expect(shapeOf(await foreign.list(p1()))).toEqual(unknown);
    expect((await owner.list(p1())).body.items).toEqual([]);
    expect((await owner.list(scene.p2.projectId)).body.items).toHaveLength(1);
  });
});
