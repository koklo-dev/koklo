import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clientSpaceApi } from "./helpers/client-space.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  advanceHead,
  createReviewScene,
  P1_FEATURES,
  type ReviewScene,
  reviewApi,
  seedProposedBaseline,
} from "./helpers/reviews.ts";

/**
 * TK-55d : `validation` et `previouslyValidated` de `clientSpace.*` (55b) sont alimentés par les vraies
 * reviews écrites par `review.submit`. La dernière review de la cible fait foi, tous clients confondus ;
 * elle ne vaut que si son SHA est la tête.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
});
const p1 = () => scene.p1.projectId;
const space = () => clientSpaceApi(bench().app, scene.c1);
const statusOf = async (id: string) => {
  const res = await space().feature(p1(), id);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return [res.body.validation, res.body.previouslyValidated];
};

describe("de review.submit vers clientSpace", () => {
  it("à valider d'abord, validée après approbation, à revoir après demande de modifications", async () => {
    expect(await statusOf("F-001")).toEqual(["to_validate", false]);
    await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP1);
    expect(await statusOf("F-001")).toEqual(["validated", false]);
    await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP1, {
      status: "changes_requested",
    });
    expect(await statusOf("F-001")).toEqual(["to_revise", false]);
  });

  it("la liste reflète aussi l'état, feature par feature", async () => {
    await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP1, { targetRef: "F-002" });

    const items = (await space().features(p1())).body.items as { id: string; validation: string }[];

    expect(items.map((i) => [i.id, i.validation])).toEqual([
      ["F-001", "to_validate"],
      ["F-002", "validated"],
    ]);
  });

  it("la spec avance : à valider et previouslyValidated vrai ; une nouvelle approbation redevient validée", async () => {
    await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP1);
    const head = await advanceHead(bench(), scene.p1, [...P1_FEATURES, { id: "F-003" }]);

    expect(await statusOf("F-001")).toEqual(["to_validate", true]);
    await reviewApi(bench().app, scene.c1).submit(p1(), head);
    expect(await statusOf("F-001")).toEqual(["validated", false]);
  });

  it("la dernière review gagne, tous clients confondus", async () => {
    await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP1, {
      status: "changes_requested",
    });
    await reviewApi(bench().app, scene.c4).submit(p1(), scene.headP1, { status: "approved" });
    expect(await statusOf("F-001")).toEqual(["validated", false]);
  });

  it("les reviews d'un projet ou d'une baseline n'influencent ni un autre projet ni les features", async () => {
    await seedProposedBaseline(bench().database, scene.p1, scene.headP1);
    await reviewApi(bench().app, scene.c1).submitBaseline(p1(), scene.headP1);
    await reviewApi(bench().app, scene.c2).submit(scene.p2.projectId, scene.headP2, {
      targetRef: "F-009",
    });

    expect(await statusOf("F-001")).toEqual(["to_validate", false]);
    const other = await clientSpaceApi(bench().app, scene.c2).feature(scene.p2.projectId, "F-009");
    expect(other.body.validation).toBe("validated");
  });
});
