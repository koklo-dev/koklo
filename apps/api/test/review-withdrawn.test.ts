import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clientSpaceApi } from "./helpers/client-space.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createReviewScene,
  FLOW_DATA,
  notificationTotal,
  P1_FEATURES,
  type ReviewScene,
  reviewApi,
  reviewRows,
  seedProposedBaseline,
} from "./helpers/reviews.ts";
import { entity, featureEntities, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-104 lot A (B349, critère 7) : « Annuler » une décision. Le journal reste en ajout seul : l'annulation est une review
 * `withdrawn` qui remet la cible « à valider », sans prévenir l'équipe ; son rejeu identique n'écrit rien.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;

const ENTITIES = [...featureEntities(P1_FEATURES), entity("flow", "P-001", "a", FLOW_DATA)];
const p1 = () => scene.p1.projectId;
const client = () => reviewApi(bench().app, scene.c1);
const flow = (status: string) => ({ targetKind: "flow", targetRef: "P-001", status });
const head = async () =>
  (await seedIndex(bench(), scene.p1, P1_FEATURES, { commit: true, entities: ENTITIES })).sha;
const flowState = async () => {
  const res = await clientSpaceApi(bench().app, scene.c1).flows(p1());
  const item = (res.body.items as { id: string; validation: string }[]).find(
    (i) => i.id === "P-001",
  );
  return item?.validation;
};

beforeEach(async () => {
  scene = await createReviewScene(bench());
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("withdrawn remet la cible à valider, le journal reste en ajout seul", () => {
  it("approuver puis annuler : validation to_validate, deux lignes, la première intacte", async () => {
    const version = await head();
    expect((await client().submit(p1(), version, flow("approved"))).status).toBe(200);
    expect(await flowState()).toBe("validated");

    const res = await client().submit(p1(), version, flow("withdrawn"));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: "withdrawn", validation: "to_validate" });
    expect(await flowState()).toBe("to_validate");
    const rows = await reviewRows(bench().database, p1());
    expect(rows.map((row) => row.status)).toEqual(["approved", "withdrawn"]);
  });

  it("une annulation n'est jamais « précédemment validée » et se valide de nouveau", async () => {
    const version = await head();
    await client().submit(p1(), version, flow("approved"));
    await client().submit(p1(), version, flow("withdrawn"));
    const res = await clientSpaceApi(bench().app, scene.c1).flows(p1());
    expect(res.body.items[0]).toMatchObject({
      validation: "to_validate",
      previouslyValidated: false,
    });

    expect((await client().submit(p1(), version, flow("approved"))).status).toBe(200);
    expect(await flowState()).toBe("validated");
  });

  it("rejeu identique : rien d'écrit ; aucune notification d'équipe pour une annulation", async () => {
    const version = await head();
    await client().submit(p1(), version, flow("approved"));
    const first = await client().submit(p1(), version, flow("withdrawn"));
    const notifications = await notificationTotal(bench().database, scene.p1.organizationId);

    const again = await client().submit(p1(), version, flow("withdrawn"));

    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await reviewRows(bench().database, p1())).toHaveLength(2);
    expect(await notificationTotal(bench().database, scene.p1.organizationId)).toBe(notifications);
  });

  it("audit review.withdraw sur la review ; review.list expose le statut withdrawn", async () => {
    const version = await head();
    const res = await client().submit(p1(), version, flow("withdrawn"));
    const audits = await bench().database.query<{ target_id: string }>(
      "SELECT target_id FROM audit_log WHERE action = 'review.withdraw' AND project_id = $1",
      [p1()],
    );
    expect(audits.map((row) => row.target_id)).toEqual([res.body.id]);
    const listed = await reviewApi(bench().app, scene.p1.world.actors.owner).list(p1());
    expect(listed.body.items.map((item: { status: string }) => item.status)).toContain("withdrawn");
  });

  it("une baseline ne s'annule pas : 409 baseline_not_open ; un développeur : 403", async () => {
    const version = await head();
    await seedProposedBaseline(bench().database, scene.p1, version);
    const baseline = await client().submitBaseline(p1(), version, { status: "withdrawn" });
    expect(baseline.status).toBe(409);
    expect(baseline.body.data).toEqual({ reason: "baseline_not_open" });
    const dev = reviewApi(bench().app, scene.p1.world.actors.dev);
    expect((await dev.submit(p1(), version, flow("withdrawn"))).status).toBe(403);
  });
});
