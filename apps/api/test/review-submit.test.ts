import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { createReviewScene, type ReviewScene, reviewApi, reviewRows } from "./helpers/reviews.ts";
import { UNKNOWN_ID } from "./helpers/suggestions.ts";

/**
 * TK-55d : `review.submit` nominal. La review est liée au SHA exact de la tête (la `version` opaque
 * du client), `repo_id` est le dépôt porteur du projet, l'auteur et son rôle viennent de la session :
 * aucune clé fournie par l'appelant n'est conservée.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
});
const p1 = () => scene.p1.projectId;
const client = () => reviewApi(bench().app, scene.c1);
const rows = () => reviewRows(bench().database, p1());

describe("nominal", () => {
  it("approbation d'une feature : 200, sortie id/status/validation/createdAt, ligne liée à la tête", async () => {
    const res = await client().submit(p1(), scene.headP1, { comment: "Parfait" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["createdAt", "id", "status", "validation"]);
    expect(res.body).toMatchObject({ status: "approved", validation: "validated" });
    const [row] = await rows();
    expect(row).toMatchObject({
      id: res.body.id,
      project_id: p1(),
      organization_id: scene.p1.organizationId,
      repo_id: scene.p1.repoId,
      target_kind: "feature",
      target_ref: "F-001",
      sha: scene.headP1,
      status: "approved",
      author_user_id: scene.c1.userId,
      author_role: "client",
      comment: "Parfait",
    });
  });

  it("modifications demandées : 200, validation to_revise", async () => {
    const res = await client().submit(p1(), scene.headP1, { status: "changes_requested" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: "changes_requested", validation: "to_revise" });
  });

  it("sans commentaire : comment nul en base", async () => {
    await client().submit(p1(), scene.headP1);
    expect((await rows())[0]?.comment).toBeNull();
  });
});

describe("rien n'est lu de l'entrée hormis la cible, la version, le statut et le commentaire", () => {
  it("sha, repoId, auteur, rôle, organisation et id forgés sont ignorés", async () => {
    const res = await client().submit(p1(), scene.headP1, {
      sha: "f".repeat(40),
      repoId: scene.p2.repoId,
      repo_id: scene.p2.repoId,
      authorId: scene.c2.userId,
      authorUserId: scene.c2.userId,
      authorRole: "owner",
      organizationId: scene.foreign.organizationId,
      id: UNKNOWN_ID,
      createdAt: "2020-01-01T00:00:00.000Z",
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [row] = await rows();
    expect(row).toMatchObject({
      id: expect.not.stringMatching(UNKNOWN_ID),
      repo_id: scene.p1.repoId,
      sha: scene.headP1,
      author_user_id: scene.c1.userId,
      author_role: "client",
      organization_id: scene.p1.organizationId,
    });
    expect(row?.created_at.getFullYear()).toBeGreaterThan(2025);
  });
});

describe("cible", () => {
  it("feature absente de la tête (F-009 est dans p2) : 404 NOT_FOUND neutre, rien d'écrit", async () => {
    const res = await client().submit(p1(), scene.headP1, { targetRef: "F-009" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(await rows()).toHaveLength(0);
  });

  it("feature supprimée de la tête : 404 à la nouvelle version, STALE_VERSION à l'ancienne", async () => {
    const { advanceHead } = await import("./helpers/reviews.ts");
    const head = await advanceHead(bench(), scene.p1, [{ id: "F-002", titre: "Profil" }]);

    expect((await client().submit(p1(), head, { targetRef: "F-001" })).status).toBe(404);
    const old = await client().submit(p1(), scene.headP1, { targetRef: "F-001" });
    expect(old.status).toBe(409);
    expect(old.body.code).toBe("STALE_VERSION");
    expect(await rows()).toHaveLength(0);
  });

  it("projet sans spec indexée : 503 SPACE_NOT_READY sans data, rien d'écrit", async () => {
    await bench().database.query("DELETE FROM spec_heads WHERE repo_id = $1", [scene.p1.repoId]);

    const res = await client().submit(p1(), scene.headP1);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SPACE_NOT_READY");
    expect(res.body.data).toBeUndefined();
    expect(await rows()).toHaveLength(0);
  });
});

describe("entrée invalide : 422 VALIDATION, jamais 500", () => {
  it.each([
    ["écran", { targetKind: "screen", targetRef: "S-home" }],
    ["statut inconnu", { status: "pending" }],
    ["targetRef mal formé", { targetRef: "F-1" }],
    ["comment de 2001 caractères", { comment: "x".repeat(2001) }],
    ["comment avec NUL", { comment: "a\u0000b" }],
    ["comment avec substitut isolé", { comment: "a\ud800b" }],
    ["version vide", { version: "" }],
  ])("%s", async (_label, over) => {
    const res = await client().submit(p1(), scene.headP1, over);

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(await rows()).toHaveLength(0);
  });
});
