import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { count } from "./helpers/organizations.ts";
import { auditOf } from "./helpers/project-client.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createSuggestionScene,
  type SuggestionScene,
  suggestionApi,
  suggestionRows,
} from "./helpers/suggestions.ts";

/**
 * TK-55c : `suggestion.accept|reject`. Compare-and-set sur l'état `open` : une décision, un décideur,
 * une note. Accepter ne modifie PAS la spec (écriture de spec = humain, par lot) : simple décision
 * tracée. Rejeu identique : 200 sans effet ; décision contraire ou suggestion retirée : 409.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SuggestionScene;
beforeEach(async () => {
  scene = await createSuggestionScene(bench());
});

const p1 = () => scene.p1.projectId;
const owner = () => suggestionApi(bench().app, scene.p1.world.actors.owner);
const dev = () => suggestionApi(bench().app, scene.p1.world.actors.dev);
const open = async () =>
  (await suggestionApi(bench().app, scene.c1).createFeature(p1(), "F-001")).body.id as string;
const decisions = (action: string) =>
  auditOf(bench().database, scene.p1.organizationId, [`suggestion.${action}`]);
const CASES = [
  ["accept", "accepted"],
  ["reject", "rejected"],
] as const;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe.each(CASES)("suggestion.%s -> %s", (action, status) => {
  it("pose statut, décideur, date et note ; la réponse est à jour", async () => {
    const id = await open();

    const res = await owner()[action](p1(), id, { note: "Merci, c'est noté" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ id, status, decisionNote: "Merci, c'est noté", mine: false });
    expect(res.body.decidedAt).toEqual(expect.any(String));
    const [row] = await suggestionRows(bench().database, p1());
    expect(row).toMatchObject({
      status,
      decided_by_user_id: scene.p1.world.actors.owner.userId,
      decision_note: "Merci, c'est noté",
    });
    expect(row?.decided_at).not.toBeNull();
  });

  it("note facultative : decision_note nul", async () => {
    const id = await open();

    const res = await dev()[action](p1(), id);

    expect(res.status).toBe(200);
    expect(res.body.decisionNote).toBeNull();
  });

  it("une entrée d'audit, cible = id de la ligne, acteur = décideur, aucun contenu", async () => {
    const id = await open();

    await owner()[action](p1(), id, { note: "texte libre de la décision" });

    expect(await decisions(action)).toEqual([
      expect.objectContaining({
        action: `suggestion.${action}`,
        target_kind: "suggestion",
        target_id: id,
        actor_id: scene.p1.world.actors.owner.userId,
        ticket_id: null,
      }),
    ]);
  });

  it("rejeu identique (même décideur ou un autre) : 200, ligne, audit et notification inchangés", async () => {
    const id = await open();
    await owner()[action](p1(), id, { note: "première note" });
    const db = bench().database;
    const [auditBefore, notifBefore] = [
      (await decisions(action)).length,
      await count(db, "notifications"),
    ];

    const again = await dev()[action](p1(), id, { note: "autre note" });

    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.decisionNote).toBe("première note");
    expect((await suggestionRows(db, p1()))[0]?.decided_by_user_id).toBe(
      scene.p1.world.actors.owner.userId,
    );
    expect((await decisions(action)).length).toBe(auditBefore);
    expect(await count(db, "notifications")).toBe(notifBefore);
  });

  it("suggestion retirée : 409 suggestion_not_open", async () => {
    const id = await open();
    await suggestionApi(bench().app, scene.c1).withdraw(p1(), id);

    const res = await owner()[action](p1(), id);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "CONFLICT", data: { reason: "suggestion_not_open" } });
  });

  it.each([
    ["note de 2001 caractères", { note: "x".repeat(2001) }],
    ["note avec octet NUL", { note: "a\u0000b" }],
    ["note avec substitut isolé", { note: "a\ud800b" }],
  ])("%s : 422 VALIDATION, suggestion toujours ouverte", async (_label, over) => {
    const id = await open();

    const res = await owner()[action](p1(), id, over);

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect((await suggestionRows(bench().database, p1()))[0]?.status).toBe("open");
  });
});

describe("contre-décision et course", () => {
  it.each(CASES)(
    "%s puis la décision contraire : 409 suggestion_not_open, état inchangé",
    async (action, status) => {
      const id = await open();
      const opposite = action === "accept" ? "reject" : "accept";
      await owner()[action](p1(), id);

      const res = await owner()[opposite](p1(), id);

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: "CONFLICT", data: { reason: "suggestion_not_open" } });
      expect((await suggestionRows(bench().database, p1()))[0]?.status).toBe(status);
      expect(await decisions(opposite)).toHaveLength(0);
    },
  );

  it("accept et reject en parallèle : un 200 et un 409, une seule entrée d'audit, une seule notification", async () => {
    const id = await open();
    const decidedBefore = await count(
      bench().database,
      "notifications",
      "type = 'suggestion.decided'",
    );

    const [accepted, rejected] = await Promise.all([
      owner().accept(p1(), id),
      dev().reject(p1(), id),
    ]);

    expect([accepted.status, rejected.status].sort()).toEqual([200, 409]);
    const [row] = await suggestionRows(bench().database, p1());
    const winner = accepted.status === 200 ? "accepted" : "rejected";
    expect(row?.status).toBe(winner);
    expect((await decisions("accept")).length + (await decisions("reject")).length).toBe(1);
    const decidedAfter = await count(
      bench().database,
      "notifications",
      "type = 'suggestion.decided'",
    );
    expect(decidedAfter - decidedBefore).toBe(1);
  });
});

describe("accepter ne touche pas la spec", () => {
  it("aucun appel au fournisseur, aucun lot, aucun instantané, tête inchangée", async () => {
    const id = await open();
    const db = bench().database;
    const tables = ["spec_snapshots", "spec_heads", "spec_features", "spec_write_batches"];
    const sizes = async () => Promise.all(tables.map((table) => count(db, table)));
    const before = await sizes();
    bench().harness.calls = [];

    const res = await owner().accept(p1(), id);

    expect(res.status).toBe(200);
    expect(await sizes()).toEqual(before);
    expect(bench().harness.calls).toEqual([]);
  });
});
