import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { shapeOf } from "./helpers/client-scene.ts";
import { auditOf } from "./helpers/project-client.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  advanceHead,
  baselineRows,
  createReviewScene,
  notificationTotal,
  P1_FEATURES,
  type ReviewScene,
  reviewApi,
  reviewRows,
  seedProposedBaseline,
} from "./helpers/reviews.ts";
import { auditTotal } from "./helpers/spec-read.ts";

/**
 * TK-55d : STALE_VERSION (409, sans data, sans oracle). La version doit être exactement la tête de la
 * spec lue ; une version périmée, inconnue, illisible, d'un autre projet ou d'un autre dépôt reçoit la
 * MÊME réponse. Aucune ligne `reviews`, notification ni audit n'est écrite, la baseline est intacte.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
});
const p1 = () => scene.p1.projectId;
const org = () => scene.p1.organizationId;
const client = () => reviewApi(bench().app, scene.c1);

async function counts() {
  const db = bench().database;
  return [
    (await reviewRows(db, p1())).length,
    await notificationTotal(db, org()),
    await auditTotal(db, org()),
  ];
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("version périmée ou inconnue", () => {
  it("la tête a avancé après la lecture du client : 409 STALE_VERSION sans data", async () => {
    await advanceHead(bench(), scene.p1, [...P1_FEATURES, { id: "F-003", titre: "Nouvelle" }]);
    const before = await counts();

    const res = await client().submit(p1(), scene.headP1);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STALE_VERSION");
    expect(res.body.data).toBeUndefined();
    expect(await counts()).toEqual(before);
  });

  it("la réponse ne contient ni la nouvelle version ni l'ancienne", async () => {
    const head = await advanceHead(bench(), scene.p1, [...P1_FEATURES, { id: "F-003" }]);

    const res = await client().submit(p1(), scene.headP1);

    expect(res.text).not.toContain(head);
    expect(res.text).not.toContain(scene.headP1);
  });

  it("une version valide pour la nouvelle tête est acceptée (le client a relu)", async () => {
    const head = await advanceHead(bench(), scene.p1, [...P1_FEATURES, { id: "F-003" }]);

    const res = await client().submit(p1(), head);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await reviewRows(bench().database, p1()))[0]?.sha).toBe(head);
  });

  it("aucun oracle : périmée, inconnue, illisible, trop courte, majuscules, autre projet, autre dépôt = même réponse", async () => {
    await advanceHead(bench(), scene.p1, [...P1_FEATURES, { id: "F-003" }]);
    const versions = [
      scene.headP1,
      "0".repeat(40),
      "pas-un-sha",
      "a".repeat(39),
      scene.headP1.toUpperCase(),
      scene.headP2,
      "0".repeat(64),
    ];

    const shapes = [];
    for (const version of versions) shapes.push(shapeOf(await client().submit(p1(), version)));

    expect(shapes[0]).toMatchObject({ status: 409, body: { code: "STALE_VERSION" } });
    for (const shape of shapes) expect(shape).toEqual(shapes[0]);
  });

  it("une version d'une autre organisation reçoit la même réponse", async () => {
    const foreign = (
      await bench().database.query<{ commit_sha: string }>(
        "SELECT commit_sha FROM spec_snapshots WHERE repo_id = $1",
        [scene.foreign.repoId],
      )
    )[0]?.commit_sha;
    const reference = shapeOf(await client().submit(p1(), "0".repeat(40)));

    expect(shapeOf(await client().submit(p1(), foreign ?? ""))).toEqual(reference);
  });
});

describe("baseline : la version doit être la tête ET la proposition", () => {
  it("proposed_sha différent de la tête : STALE_VERSION, baseline inchangée, rien d'écrit", async () => {
    await seedProposedBaseline(bench().database, scene.p1, scene.headP1);
    const head = await advanceHead(bench(), scene.p1, [...P1_FEATURES, { id: "F-003" }]);
    const before = await counts();

    const res = await client().submitBaseline(p1(), head);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STALE_VERSION");
    expect(await counts()).toEqual(before);
    expect((await baselineRows(bench().database, p1()))[0]).toMatchObject({
      status: "proposed",
      review_id: null,
    });
  });

  it("aucune entrée d'audit review.* sur un refus de version", async () => {
    await client().submit(p1(), "0".repeat(40));
    expect(
      await auditOf(bench().database, org(), ["review.approve", "review.request_changes"]),
    ).toEqual([]);
  });
});
