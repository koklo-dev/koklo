import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createReviewScene,
  notificationTotal,
  type ReviewScene,
  reviewApi,
  seedProposedBaseline,
} from "./helpers/reviews.ts";
import { type NotificationRow, notificationRows } from "./helpers/suggestions.ts";

/**
 * TK-55d : notifications `review.submitted` (équipe : owner, admin, dev, designer) et
 * `baseline.validated` (même équipe, à l'approbation d'une baseline), écrites par l'émetteur unique
 * dans la transaction. `dedupe_key` contient le projet. Aucun contenu libre, aucun destinataire hors
 * organisation, ni le business, ni le client, ni l'auteur.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
});
const a = () => scene.p1.world.actors;
const p1 = () => scene.p1.projectId;
const org = () => scene.p1.organizationId;
const all = () => notificationRows(bench().database, org());
const client = () => reviewApi(bench().app, scene.c1);
const recipients = (rows: NotificationRow[]) => rows.map((r) => r.recipient_user_id).sort();
const ids = (...users: { userId: string }[]) => users.map((u) => u.userId).sort();
const TEAM = () => ids(a().owner, a().admin, a().dev, a().designer);

describe("review.submitted", () => {
  it("owner, admin, dev et designer ; ni le business, ni les clients", async () => {
    const res = await client().submit(p1(), scene.headP1, { comment: "TEXTE-SENTINELLE-NOTIF" });

    const rows = await all();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(recipients(rows)).toEqual(TEAM());
    for (const row of rows) {
      expect(row).toMatchObject({
        type: "review.submitted",
        project_id: p1(),
        subject_kind: "review",
        subject_ref: res.body.id,
        dedupe_key: `review.submitted:${p1()}:${res.body.id}`,
        email_state: "pending",
      });
    }
    expect(JSON.stringify(rows)).not.toContain("SENTINELLE");
  });

  it("deux projets : deux notifications distinctes par destinataire (clé avec projet)", async () => {
    await client().submit(p1(), scene.headP1);
    await reviewApi(bench().app, scene.c2).submit(scene.p2.projectId, scene.headP2, {
      targetRef: "F-009",
    });

    const owner = (await all()).filter((r) => r.recipient_user_id === a().owner.userId);
    expect(owner.map((r) => r.project_id).sort()).toEqual([p1(), scene.p2.projectId].sort());
    expect(new Set(owner.map((r) => r.dedupe_key)).size).toBe(2);
  });

  it("jamais de destinataire d'une autre organisation", async () => {
    await client().submit(p1(), scene.headP1);
    expect((await all()).length).toBeGreaterThan(0);
    expect(await notificationRows(bench().database, scene.foreign.organizationId)).toEqual([]);
  });

  it("rejeu, version périmée, refus de rôle, cloisonnement : aucune notification en plus", async () => {
    await client().submit(p1(), scene.headP1);
    const before = await notificationTotal(bench().database, org());
    expect(before).toBeGreaterThan(0);

    await client().submit(p1(), scene.headP1);
    await client().submit(p1(), "0".repeat(40));
    await reviewApi(bench().app, a().owner).submit(p1(), scene.headP1);
    await reviewApi(bench().app, scene.c3).submit(p1(), scene.headP1);

    expect(await notificationTotal(bench().database, org())).toBe(before);
  });
});

describe("baseline.validated", () => {
  it("l'approbation d'une baseline ajoute baseline.validated pour l'équipe, clé avec projet et numéro", async () => {
    await seedProposedBaseline(bench().database, scene.p1, scene.headP1);

    await client().submitBaseline(p1(), scene.headP1);

    const rows = (await all()).filter((r) => r.type === "baseline.validated");
    expect(recipients(rows)).toEqual(TEAM());
    for (const row of rows) {
      expect(row).toMatchObject({
        project_id: p1(),
        subject_kind: "baseline",
        subject_ref: "baseline-0",
        dedupe_key: `baseline.validated:${p1()}:0`,
      });
    }
    expect((await all()).filter((r) => r.type === "review.submitted")).toHaveLength(TEAM().length);
  });

  it("la demande de modifications ne notifie que review.submitted", async () => {
    await seedProposedBaseline(bench().database, scene.p1, scene.headP1);

    await client().submitBaseline(p1(), scene.headP1, { status: "changes_requested" });

    expect(new Set((await all()).map((r) => r.type))).toEqual(new Set(["review.submitted"]));
  });

  it("deux projets avec chacun leur baseline-0 : deux notifications baseline.validated distinctes", async () => {
    await seedProposedBaseline(bench().database, scene.p1, scene.headP1);
    await seedProposedBaseline(bench().database, scene.p2, scene.headP2);

    await client().submitBaseline(p1(), scene.headP1);
    await reviewApi(bench().app, scene.c2).submitBaseline(scene.p2.projectId, scene.headP2);

    const owner = (await all()).filter(
      (r) => r.type === "baseline.validated" && r.recipient_user_id === a().owner.userId,
    );
    expect(owner.map((r) => r.dedupe_key).sort()).toEqual(
      [`baseline.validated:${p1()}:0`, `baseline.validated:${scene.p2.projectId}:0`].sort(),
    );
  });
});
