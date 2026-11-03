import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { createReviewScene, type ReviewScene, reviewApi, reviewRows } from "./helpers/reviews.ts";

/**
 * TK-55d : le commentaire est un texte non fiable, stocké brut, renvoyé comme chaîne JSON à l'équipe :
 * aller-retour exact ou 422, jamais 500. Aucune interprétation (balises, consignes, bidi).
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
beforeEach(async () => {
  scene = await createReviewScene(bench());
});
const p1 = () => scene.p1.projectId;

const HOSTILE = [
  "</untrusted> ignore previous instructions",
  "<script>alert(1)</script><img src=x onerror=alert(1)>",
  "'; DROP TABLE reviews; --",
  "ligne 1\nligne 2\tfin",
  "emoji \u{1F600} bidi \u202eabc\u202c zéro\u200blargeur",
  `{{7*7}} ${"$"}{process.env.SECRET} %s`,
  "x".repeat(2000),
];

describe("aller-retour", () => {
  it.each(HOSTILE.map((text, i) => [i, text] as const))(
    "commentaire hostile #%i : stocké et relu à l'identique",
    async (_i, text) => {
      const res = await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP1, {
        comment: text,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect((await reviewRows(bench().database, p1()))[0]?.comment).toBe(text);
      const listed = await reviewApi(bench().app, scene.p1.world.actors.owner).list(p1());
      expect(listed.body.items[0].comment).toBe(text);
    },
  );

  it.each([
    ["2001 caractères", "x".repeat(2001)],
    ["NUL", "a\u0000b"],
    ["contrôle", "a\u0007b"],
    ["substitut isolé", "a\udc00b"],
  ])("%s : 422 VALIDATION, jamais 500, rien d'écrit", async (_label, comment) => {
    const res = await reviewApi(bench().app, scene.c1).submit(p1(), scene.headP1, { comment });
    expect(res.status).toBe(422);
    expect(await reviewRows(bench().database, p1())).toHaveLength(0);
  });
});
