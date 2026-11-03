import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditOf } from "./helpers/project-client.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createReviewScene,
  notificationTotal,
  type ReviewScene,
  reviewApi,
  reviewRows,
} from "./helpers/reviews.ts";

/**
 * TK-55d : journal append-only idempotent. Un rejeu strictement identique (même auteur, cible, SHA,
 * statut, commentaire) à SA dernière review renvoie cette ligne sans écrire ; un changement d'avis
 * (A, B, A) crée trois lignes ; l'API n'offre ni UPDATE ni DELETE.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
});
const p1 = () => scene.p1.projectId;
const org = () => scene.p1.organizationId;
const client = () => reviewApi(bench().app, scene.c1);
const rows = () => reviewRows(bench().database, p1());
const audits = () => auditOf(bench().database, org(), ["review.approve", "review.request_changes"]);

describe("rejeu identique", () => {
  it("deux appels identiques : même id, une seule ligne, un audit, mêmes notifications", async () => {
    const first = await client().submit(p1(), scene.headP1, { comment: "Ok" });
    const notified = await notificationTotal(bench().database, org());

    const again = await client().submit(p1(), scene.headP1, { comment: "Ok" });

    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await rows()).toHaveLength(1);
    expect(await audits()).toHaveLength(1);
    expect(await notificationTotal(bench().database, org())).toBe(notified);
  });

  it("cinq appels simultanés identiques : une seule ligne", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => client().submit(p1(), scene.headP1)),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await rows()).toHaveLength(1);
  });

  it("un commentaire différent n'est pas un rejeu : nouvelle ligne", async () => {
    await client().submit(p1(), scene.headP1, { comment: "A" });
    await client().submit(p1(), scene.headP1, { comment: "B" });
    expect(await rows()).toHaveLength(2);
  });

  it("un autre client avec le même contenu écrit sa propre ligne (le rejeu est par auteur)", async () => {
    await client().submit(p1(), scene.headP1);
    const other = await reviewApi(bench().app, scene.c4).submit(p1(), scene.headP1);

    expect(other.status).toBe(200);
    expect(await rows()).toHaveLength(2);
  });
});

describe("changement d'avis : le journal garde tout, la dernière gagne", () => {
  it("approuvée, modifications demandées, approuvée : trois lignes, trois audits", async () => {
    const a = await client().submit(p1(), scene.headP1, { status: "approved" });
    const b = await client().submit(p1(), scene.headP1, { status: "changes_requested" });
    const c = await client().submit(p1(), scene.headP1, { status: "approved" });

    expect(new Set([a.body.id, b.body.id, c.body.id]).size).toBe(3);
    expect((await rows()).map((r) => r.status)).toEqual([
      "approved",
      "changes_requested",
      "approved",
    ]);
    expect((await audits()).map((e) => e.action)).toEqual([
      "review.approve",
      "review.request_changes",
      "review.approve",
    ]);
  });
});

describe("aucune modification ni suppression par l'API", () => {
  it.each(["put", "patch", "delete"] as const)(
    "%s sur une review : route inconnue (404 ou 405), journal intact",
    async (method) => {
      const created = await client().submit(p1(), scene.headP1);
      const { send } = await import("./helpers/tickets.ts");

      const res = await send(
        bench().app,
        scene.c1.cookie,
        method,
        `/projects/${p1()}/reviews/${created.body.id}`,
        { status: "changes_requested" },
      );

      expect([404, 405]).toContain(res.status);
      const [row] = await rows();
      expect(row).toMatchObject({ id: created.body.id, status: "approved" });
    },
  );

  it("la base refuse UPDATE et DELETE du journal (filet de TK-51)", async () => {
    await client().submit(p1(), scene.headP1);
    const db = bench().database;
    await expect(db.query("UPDATE reviews SET status = 'changes_requested'")).rejects.toThrow();
    await expect(db.query("DELETE FROM reviews WHERE project_id = $1", [p1()])).rejects.toThrow();
    expect(await rows()).toHaveLength(1);
  });
});
