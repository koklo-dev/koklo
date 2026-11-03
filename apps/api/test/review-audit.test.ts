import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditOf } from "./helpers/project-client.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createReviewScene,
  type ReviewScene,
  reviewApi,
  reviewRows,
  seedProposedBaseline,
} from "./helpers/reviews.ts";
import { auditTotal } from "./helpers/spec-read.ts";

/**
 * TK-55d : audit de `review.submit`. Actions stables `review.approve` / `review.request_changes`,
 * `targetKind: "review"`, `targetId` = id de la ligne, jamais de contenu libre ni de SHA. Une entrée
 * par écriture réelle ; rejeu, refus, version périmée et lecture n'en produisent aucune.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
  await bench().database.query("DELETE FROM audit_fail");
});
const p1 = () => scene.p1.projectId;
const org = () => scene.p1.organizationId;
const client = () => reviewApi(bench().app, scene.c1);
const ACTIONS = ["review.approve", "review.request_changes"];

describe("une entrée par écriture réelle", () => {
  it("approbation et demande de modifications : action, cible, acteur exacts", async () => {
    const a = await client().submit(p1(), scene.headP1, { status: "approved" });
    const b = await client().submit(p1(), scene.headP1, {
      targetRef: "F-002",
      status: "changes_requested",
    });

    const entries = await auditOf(bench().database, org(), ACTIONS);

    expect(entries.map((e) => [e.action, e.target_id, e.actor_id])).toEqual([
      ["review.approve", a.body.id, scene.c1.userId],
      ["review.request_changes", b.body.id, scene.c1.userId],
    ]);
    for (const entry of entries) {
      expect(entry).toMatchObject({ target_kind: "review", ticket_id: null });
    }
  });

  it("la validation d'une baseline n'ajoute qu'une entrée review.approve", async () => {
    await seedProposedBaseline(bench().database, scene.p1, scene.headP1);
    const res = await client().submitBaseline(p1(), scene.headP1);

    expect((await auditOf(bench().database, org(), ACTIONS)).map((e) => e.target_id)).toEqual([
      res.body.id,
    ]);
  });
});

describe("aucune entrée sans écriture réelle", () => {
  it("lecture, rejeu, refus de rôle, cloisonnement, version périmée, validation et cible absente", async () => {
    await client().submit(p1(), scene.headP1);
    const before = await auditTotal(bench().database, org());

    await reviewApi(bench().app, scene.p1.world.actors.owner).list(p1());
    await client().submit(p1(), scene.headP1);
    await reviewApi(bench().app, scene.p1.world.actors.owner).submit(p1(), scene.headP1);
    await reviewApi(bench().app, scene.c3).submit(p1(), scene.headP1);
    await client().submit(p1(), "0".repeat(40));
    await client().submit(p1(), scene.headP1, { comment: "x".repeat(2001) });
    await client().submit(p1(), scene.headP1, { targetRef: "F-999" });

    expect(await auditTotal(bench().database, org())).toBe(before);
  });
});

describe("jamais de contenu libre ni de SHA", () => {
  it("commentaire, SHA et référence de cible ne figurent dans aucune colonne d'audit", async () => {
    await client().submit(p1(), scene.headP1, { comment: "COMMENTAIRE-SENTINELLE-AUDIT" });
    const rows = await bench().database.query(
      "SELECT row_to_json(a)::text AS row FROM audit_log a WHERE organization_id = $1",
      [org()],
    );

    const text = JSON.stringify(rows);
    expect(text).not.toContain("SENTINELLE");
    expect(text).not.toContain(scene.headP1);
    expect(text).not.toContain("F-001");
  });
});

describe("atomicité", () => {
  it("échec d'audit : 500, aucune review ni notification, puis le rejeu réussit", async () => {
    await bench().database.query("INSERT INTO audit_fail (action) VALUES ('review.approve')");

    const res = await client().submit(p1(), scene.headP1);

    expect(res.status).toBe(500);
    expect(await reviewRows(bench().database, p1())).toHaveLength(0);
    const notified = await bench().database.query(
      "SELECT 1 FROM notifications WHERE organization_id = $1",
      [org()],
    );
    expect(notified).toHaveLength(0);
    await bench().database.query("DELETE FROM audit_fail");
    expect((await client().submit(p1(), scene.headP1)).status).toBe(200);
  });
});
