import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ROLES } from "./helpers/organizations.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { createReviewScene, type ReviewScene, reviewApi, reviewRows } from "./helpers/reviews.ts";

/**
 * TK-55d : matrice des rôles (CDC §14, analyse §3.3, N7). Valider = le CLIENT lié seul : owner, admin,
 * dev, designer et business reçoivent 403, y compris le propriétaire. Lire le journal : l'équipe et le
 * business, jamais le client. Le garde de rôle précède le cloisonnement.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
});
const as = (role: (typeof ROLES)[number]) => reviewApi(bench().app, scene.p1.world.actors[role]);
const p1 = () => scene.p1.projectId;
const NOT_CLIENT = ["owner", "admin", "dev", "designer", "business"] as const;
const READERS = ["owner", "admin", "dev", "designer", "business"] as const;

describe("review.submit", () => {
  it("le client lié valide : 200", async () => {
    const res = await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP1);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it.each(NOT_CLIENT)("%s : 403 FORBIDDEN, aucune review", async (role) => {
    const res = await as(role).submit(p1(), scene.headP1);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(await reviewRows(bench().database, p1())).toHaveLength(0);
  });

  it("le propriétaire ne valide pas non plus une baseline", async () => {
    const res = await as("owner").submitBaseline(p1(), scene.headP1);
    expect(res.status).toBe(403);
  });

  it("client sans lien : 404 (le garde de rôle passe, le cloisonnement refuse)", async () => {
    const res = await reviewApi(bench().app, scene.c3).submit(p1(), scene.headP1);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("sans session : 401 UNAUTHORIZED", async () => {
    const res = await reviewApi(bench().app, undefined).submit(p1(), scene.headP1);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});

describe("review.list", () => {
  it.each(READERS)("%s lit le journal : 200", async (role) => {
    const res = await as(role).list(p1());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("le client, lié ou non : 403 (le détail technique est réservé à l'équipe)", async () => {
    for (const actor of [scene.c1, scene.c3]) {
      const res = await reviewApi(bench().app, actor).list(p1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
  });

  it("sans session : 401", async () => {
    expect((await reviewApi(bench().app, undefined).list(p1())).status).toBe(401);
  });
});
