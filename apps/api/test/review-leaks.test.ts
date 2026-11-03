import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  advanceHead,
  createReviewScene,
  P1_FEATURES,
  type ReviewScene,
  reviewApi,
  seedProposedBaseline,
} from "./helpers/reviews.ts";
import { forbiddenKeys, HAS_SHA, UNKNOWN_ID } from "./helpers/suggestions.ts";

/**
 * TK-55d : fuite de vocabulaire technique côté client. Les réponses réelles de `review.submit` (succès,
 * STALE_VERSION, 404, 409, 422, 503) n'ont aucune clé du vocabulaire git ni SHA de 40 hexadécimaux.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
});
const p1 = () => scene.p1.projectId;
const client = () => reviewApi(bench().app, scene.c1);

describe("réponses réelles de review.submit", () => {
  it("succès feature et baseline, STALE_VERSION, 404, 409, 422, 503 : ni clé interdite, ni SHA", async () => {
    await seedProposedBaseline(bench().database, scene.p1, scene.headP1);
    const ok = await client().submit(p1(), scene.headP1);
    const baseline = await client().submitBaseline(p1(), scene.headP1);
    const conflict = await reviewApi(bench().app, scene.c4).submitBaseline(p1(), scene.headP1);
    const missing = await client().submit(p1(), scene.headP1, { targetRef: "F-009" });
    const invalid = await client().submit(p1(), scene.headP1, { comment: "a\u0000" });
    await advanceHead(bench(), scene.p1, [...P1_FEATURES, { id: "F-003" }]);
    const stale = await client().submit(p1(), scene.headP1);
    await bench().database.query("DELETE FROM spec_heads WHERE repo_id = $1", [scene.p1.repoId]);
    const notReady = await client().submit(p1(), scene.headP1);
    const unknown = await client().submit(UNKNOWN_ID, scene.headP1);

    const statuses = [ok, baseline, conflict, missing, invalid, stale, notReady, unknown].map(
      (r) => r.status,
    );
    expect(statuses).toEqual([200, 200, 409, 404, 422, 409, 503, 404]);
    for (const res of [ok, baseline, conflict, missing, invalid, stale, notReady, unknown]) {
      expect(forbiddenKeys(res.body), res.text).toEqual([]);
      expect(res.text).not.toMatch(HAS_SHA);
    }
  });
});
