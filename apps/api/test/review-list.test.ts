import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  advanceHead,
  createReviewScene,
  P1_FEATURES,
  type ReviewScene,
  reviewApi,
} from "./helpers/reviews.ts";

/**
 * TK-55d : `review.list` (équipe et business) : preuve technique avec le SHA exact, l'auteur, son rôle,
 * le commentaire et `current` (sha = tête). Plus récentes d'abord, filtres, pagination par curseur.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
});
const p1 = () => scene.p1.projectId;
const client = () => reviewApi(bench().app, scene.c1);
const owner = () => reviewApi(bench().app, scene.p1.world.actors.owner);

describe("contenu", () => {
  it("chaque ligne porte id, cible, sha, statut, auteur, rôle, commentaire, date, current", async () => {
    const sent = await client().submit(p1(), scene.headP1, { comment: "Merci" });

    const res = await owner().list(p1());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.items).toEqual([
      {
        id: sent.body.id,
        targetKind: "feature",
        targetRef: "F-001",
        sha: scene.headP1,
        status: "approved",
        authorId: scene.c1.userId,
        authorRole: "client",
        comment: "Merci",
        createdAt: sent.body.createdAt,
        current: true,
        onBehalf: false,
      },
    ]);
  });

  it("current passe à faux quand la spec avance, la ligne reste dans le journal", async () => {
    await client().submit(p1(), scene.headP1);
    await advanceHead(bench(), scene.p1, [...P1_FEATURES, { id: "F-003" }]);

    const res = await owner().list(p1());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [item] = res.body.items;
    expect(item).toMatchObject({ sha: scene.headP1, current: false });
  });

  it("A, B, A : les trois lignes, la plus récente d'abord", async () => {
    for (const status of ["approved", "changes_requested", "approved"]) {
      await client().submit(p1(), scene.headP1, { status });
    }

    const res = await owner().list(p1());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const items = res.body.items as { status: string }[];
    expect(items.map((i) => i.status)).toEqual(["approved", "changes_requested", "approved"]);
  });
});

describe("filtres et pagination", () => {
  beforeEach(async () => {
    await client().submit(p1(), scene.headP1, { targetRef: "F-001" });
    await client().submit(p1(), scene.headP1, { targetRef: "F-002" });
    await client().submit(p1(), scene.headP1, { targetRef: "F-001", status: "changes_requested" });
  });

  it("targetRef et targetKind filtrent", async () => {
    const byRef = (await owner().list(p1(), "?targetRef=F-002")).body.items;
    const byKind = (await owner().list(p1(), "?targetKind=baseline")).body.items;

    expect(byRef).toHaveLength(1);
    expect(byKind).toEqual([]);
  });

  it("limit et cursor : deux pages sans doublon ni trou, plus récentes d'abord", async () => {
    const first = (await owner().list(p1(), "?limit=2")).body;
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = (
      await owner().list(p1(), `?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)
    ).body;
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((i: { id: string }) => i.id);
    expect(new Set(ids).size).toBe(3);
    expect(first.items[0].status).toBe("changes_requested");
  });

  it.each(["?limit=0", "?limit=101", "?targetKind=screen"])(
    "%s : 422 VALIDATION",
    async (query) => {
      const res = await owner().list(p1(), query);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
    },
  );
});
