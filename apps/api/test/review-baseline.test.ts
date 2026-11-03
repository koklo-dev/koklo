import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditOf } from "./helpers/project-client.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  baselineRows,
  createReviewScene,
  type ReviewScene,
  reviewApi,
  reviewRows,
  seedProposedBaseline,
} from "./helpers/reviews.ts";
import { notificationRows } from "./helpers/suggestions.ts";

/**
 * TK-55d : validation d'une baseline `proposed` par le client. L'approbation passe la baseline à
 * `validated` dans la même transaction que la review, l'audit et les notifications ; elle est liée à
 * `proposed_sha`. `changes_requested` n'altère pas la baseline. La fusion et le tag restent à TK-56.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
  await bench().database.query("DELETE FROM audit_fail");
});
const p1 = () => scene.p1.projectId;
const db = () => bench().database;
const c1 = () => reviewApi(bench().app, scene.c1);
const baseline = async () => (await baselineRows(db(), p1()))[0];

describe("approbation", () => {
  it("proposed devient validated : review_id, validated_at posés, proposed_sha intact, pas de tag", async () => {
    await seedProposedBaseline(db(), scene.p1, scene.headP1);

    const res = await c1().submitBaseline(p1(), scene.headP1, { comment: "Validé" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: "approved", validation: "validated" });
    const [review] = await reviewRows(db(), p1());
    expect(review).toMatchObject({
      target_kind: "baseline",
      target_ref: "baseline-0",
      sha: scene.headP1,
      repo_id: scene.p1.repoId,
    });
    expect(await baseline()).toMatchObject({
      status: "validated",
      review_id: review?.id,
      proposed_sha: scene.headP1,
      tag_sha: null,
    });
    expect((await baseline())?.validated_at).not.toBeNull();
  });

  it("les baselines suivantes se valident par leur numéro (baseline-3)", async () => {
    await db().query(
      `INSERT INTO baselines (id, organization_id, project_id, repo_id, number, status, proposed_sha, review_id, validated_at, tag_sha, tagged_at, created_at, updated_at)
       SELECT gen_random_uuid(), $1, $2, $3, n, 'proposed', $4, NULL, NULL, NULL, NULL, now(), now() FROM (VALUES (3)) AS t(n)`,
      [scene.p1.organizationId, p1(), scene.p1.repoId, scene.headP1],
    );

    const res = await c1().submitBaseline(p1(), scene.headP1, { targetRef: "baseline-3" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await baseline())?.status).toBe("validated");
  });
});

describe("modifications demandées", () => {
  it("la review est écrite, la baseline reste proposed et sans review", async () => {
    await seedProposedBaseline(db(), scene.p1, scene.headP1);

    const res = await c1().submitBaseline(p1(), scene.headP1, { status: "changes_requested" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.validation).toBe("to_revise");
    expect(await reviewRows(db(), p1())).toHaveLength(1);
    expect(await baseline()).toMatchObject({
      status: "proposed",
      review_id: null,
      validated_at: null,
    });
    const types = (await notificationRows(db(), scene.p1.organizationId)).map((n) => n.type);
    expect(types).not.toContain("baseline.validated");
  });
});

describe("refus", () => {
  it("baseline absente du projet (baseline-0 n'existe que dans p2) : 404, rien d'écrit", async () => {
    await seedProposedBaseline(db(), scene.p2, scene.headP2);

    const res = await c1().submitBaseline(p1(), scene.headP1);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(await reviewRows(db(), p1())).toHaveLength(0);
    expect((await baselineRows(db(), scene.p2.projectId))[0]?.status).toBe("proposed");
  });

  it("numéro inconnu (baseline-7) : 404", async () => {
    await seedProposedBaseline(db(), scene.p1, scene.headP1);
    const res = await c1().submitBaseline(p1(), scene.headP1, { targetRef: "baseline-7" });
    expect(res.status).toBe(404);
  });

  it("déjà validated : une autre validation reçoit 409 baseline_not_open, rien d'écrit", async () => {
    await seedProposedBaseline(db(), scene.p1, scene.headP1);
    await c1().submitBaseline(p1(), scene.headP1);

    const other = await reviewApi(bench().app, scene.c4).submitBaseline(p1(), scene.headP1);
    const reversed = await c1().submitBaseline(p1(), scene.headP1, { status: "changes_requested" });

    for (const res of [other, reversed]) {
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: "CONFLICT", data: { reason: "baseline_not_open" } });
    }
    expect(await reviewRows(db(), p1())).toHaveLength(1);
  });

  it("rejeu identique après validation : 200 idempotent, aucune ligne en plus", async () => {
    await seedProposedBaseline(db(), scene.p1, scene.headP1);
    const first = await c1().submitBaseline(p1(), scene.headP1);

    const again = await c1().submitBaseline(p1(), scene.headP1);

    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await reviewRows(db(), p1())).toHaveLength(1);
  });

  it("baseline taguée : 409 baseline_not_open", async () => {
    const { seedTaggedBaseline } = await import("./helpers/client-space.ts");
    await seedTaggedBaseline(db(), scene.p1, scene.headP1);

    const res = await c1().submitBaseline(p1(), scene.headP1);

    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ reason: "baseline_not_open" });
  });
});

describe("atomicité et concurrence", () => {
  it("échec d'audit : ni review, ni baseline validée, ni notification, puis le rejeu réussit", async () => {
    await seedProposedBaseline(db(), scene.p1, scene.headP1);
    await db().query("INSERT INTO audit_fail (action) VALUES ('review.approve')");

    const res = await c1().submitBaseline(p1(), scene.headP1);

    expect(res.status).toBe(500);
    expect(await reviewRows(db(), p1())).toHaveLength(0);
    expect((await baseline())?.status).toBe("proposed");
    expect(await notificationRows(db(), scene.p1.organizationId)).toEqual([]);
    expect(await auditOf(db(), scene.p1.organizationId, ["review.approve"])).toEqual([]);
    await db().query("DELETE FROM audit_fail");
    expect((await c1().submitBaseline(p1(), scene.headP1)).status).toBe(200);
  });

  it("deux clients approuvent en parallèle : un 200, un 409, une seule review et une validation", async () => {
    await seedProposedBaseline(db(), scene.p1, scene.headP1);

    const results = await Promise.all([
      c1().submitBaseline(p1(), scene.headP1),
      reviewApi(bench().app, scene.c4).submitBaseline(p1(), scene.headP1),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await reviewRows(db(), p1())).toHaveLength(1);
    const validated = (await notificationRows(db(), scene.p1.organizationId)).filter(
      (n) => n.type === "baseline.validated",
    );
    expect(new Set(validated.map((n) => n.dedupe_key)).size).toBe(1);
  });
});
