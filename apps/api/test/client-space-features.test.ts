import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clientSpaceApi,
  createSpaceScene,
  type SpaceScene,
  seedReview,
  seedSuggestion,
} from "./helpers/client-space.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { type FeatureSeed, seedIndex, specReadApi } from "./helpers/spec-read.ts";

/**
 * TK-55b : `clientSpace.features` (liste paginée) et `clientSpace.feature` (détail lu dans git au SHA
 * indexé). Vocabulaire métier uniquement ; `version` est le jeton opaque de la tête de spec lue ;
 * `validation` se calcule sur la dernière review de la cible (jamais écrite par ce lot).
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SpaceScene;
beforeEach(async () => {
  scene = await createSpaceScene(bench());
});

const feature = (n: number, over: Partial<FeatureSeed> = {}): FeatureSeed => ({
  id: `F-${String(n).padStart(3, "0")}`,
  titre: `Feature ${n}`,
  priorite: "must",
  criteres: [{ titre: "Un critère" }],
  ...over,
});
const api = () => clientSpaceApi(bench().app, scene.c1);
const OLD_SHA = "1".repeat(40);

async function indexed(features: FeatureSeed[]) {
  return seedIndex(bench(), scene.p1, features, { commit: true });
}
interface Item {
  id: string;
  validation: string;
  previouslyValidated: boolean;
  openSuggestions: number;
}
const itemOf = (body: { items: Item[] }, id: string) => body.items.find((item) => item.id === id);

describe("clientSpace.features : contenu d'une ligne", () => {
  it("exactement id, title, priority, criteriaCount, validation, previouslyValidated, openSuggestions", async () => {
    const { sha } = await indexed([
      feature(1, {
        titre: "Connexion",
        criteres: [{ titre: "a" }, { titre: "b" }],
        tables: ["T-user"],
      }),
    ]);

    const res = await api().features(scene.p1.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          id: "F-001",
          title: "Connexion",
          priority: "must",
          criteriaCount: 2,
          validation: "to_validate",
          previouslyValidated: false,
          openSuggestions: 0,
        },
      ],
      version: sha,
      nextCursor: null,
      total: 1,
      offset: 0,
    });
  });

  it("tri numérique sur F-nnn (F-002 avant F-010)", async () => {
    await indexed([feature(10), feature(2), feature(1)]);

    const res = await api().features(scene.p1.projectId);

    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual(["F-001", "F-002", "F-010"]);
  });

  it("la tête lue est celle de spec.head : branche de travail avant la branche par défaut", async () => {
    await seedIndex(bench(), scene.p1, [feature(1, { titre: "Ancien" })], { branch: "main" });
    const onlyMain = await api().features(scene.p1.projectId);
    const { sha } = await seedIndex(bench(), scene.p1, [feature(1, { titre: "Nouveau" })]);

    const both = await api().features(scene.p1.projectId);
    const head = await specReadApi(bench().app, scene.p1.world.actors.owner).head(
      scene.p1.projectId,
    );

    expect(onlyMain.body.items[0].title).toBe("Ancien");
    expect(both.body.items[0].title).toBe("Nouveau");
    expect(both.body.version).toBe(sha);
    expect(both.body.version).toBe(head.body.commitSha);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("clientSpace.features : validation calculée sur les reviews", () => {
  it("validated, to_revise, caduque, et rien : un statut par feature", async () => {
    const { sha } = await indexed([feature(1), feature(2), feature(3), feature(4), feature(5)]);
    const db = bench().database;
    await seedReview(db, scene.p1, { targetRef: "F-001", status: "approved", sha });
    await seedReview(db, scene.p1, { targetRef: "F-002", status: "changes_requested", sha });
    await seedReview(db, scene.p1, { targetRef: "F-003", status: "approved", sha: OLD_SHA });
    await seedReview(db, scene.p1, {
      targetRef: "F-004",
      status: "changes_requested",
      sha: OLD_SHA,
    });

    const { body } = await api().features(scene.p1.projectId);

    const state = (id: string) => [
      itemOf(body, id)?.validation,
      itemOf(body, id)?.previouslyValidated,
    ];
    expect(state("F-001")).toEqual(["validated", false]);
    expect(state("F-002")).toEqual(["to_revise", false]);
    expect(state("F-003")).toEqual(["to_validate", true]);
    expect(state("F-004")).toEqual(["to_validate", false]);
    expect(state("F-005")).toEqual(["to_validate", false]);
  });

  it("la dernière review gagne, tous auteurs confondus (A puis B puis A)", async () => {
    const { sha } = await indexed([feature(1)]);
    const db = bench().database;
    const other = scene.p1.world.actors.owner.userId;
    const row = (status: "approved" | "changes_requested", minute: number, authorUserId?: string) =>
      seedReview(db, scene.p1, {
        targetRef: "F-001",
        status,
        sha,
        authorUserId,
        createdAt: `2026-11-02T10:0${minute}:00.000Z`,
      });
    await row("approved", 1);
    await row("changes_requested", 2, other);
    expect(itemOf((await api().features(scene.p1.projectId)).body, "F-001")?.validation).toBe(
      "to_revise",
    );

    await row("approved", 3, other);
    expect(itemOf((await api().features(scene.p1.projectId)).body, "F-001")?.validation).toBe(
      "validated",
    );
  });

  it("une review d'un autre projet ou d'une autre cible ne compte pas", async () => {
    const { sha } = await indexed([feature(1)]);
    const db = bench().database;
    const p2 = await seedIndex(bench(), scene.p2, [feature(1)]);
    await seedReview(db, scene.p2, { targetRef: "F-001", status: "approved", sha: p2.sha });
    await seedReview(db, scene.p1, { targetRef: "F-002", status: "approved", sha });
    await seedReview(db, scene.p1, {
      targetRef: "baseline-0",
      targetKind: "baseline",
      status: "approved",
      sha,
    });

    const { body } = await api().features(scene.p1.projectId);

    expect(itemOf(body, "F-001")?.validation).toBe("to_validate");
  });

  it("la spec avance : l'ancienne validation devient caduque et la version change", async () => {
    const first = await indexed([feature(1)]);
    await seedReview(bench().database, scene.p1, {
      targetRef: "F-001",
      status: "approved",
      sha: first.sha,
    });
    const before = await api().features(scene.p1.projectId);

    const next = await indexed([feature(1, { titre: "Modifiée" })]);
    const after = await api().features(scene.p1.projectId);

    expect(itemOf(before.body, "F-001")?.validation).toBe("validated");
    expect(after.body.version).toBe(next.sha);
    expect(after.body.version).not.toBe(before.body.version);
    expect(itemOf(after.body, "F-001")).toMatchObject({
      validation: "to_validate",
      previouslyValidated: true,
    });
  });
});

describe("clientSpace.features : suggestions ouvertes", () => {
  it("compte les seules suggestions ouvertes de la feature, dans ce projet", async () => {
    await indexed([feature(1), feature(2)]);
    const db = bench().database;
    await seedSuggestion(db, scene.p1, { key: "SG-1", targetRef: "F-001" });
    await seedSuggestion(db, scene.p1, { key: "SG-2", targetRef: "F-001" });
    await seedSuggestion(db, scene.p1, { key: "SG-3", targetRef: "F-001", status: "accepted" });
    await seedSuggestion(db, scene.p1, { key: "SG-4", targetRef: "F-001", status: "withdrawn" });
    await seedSuggestion(db, scene.p1, { key: "SG-5", targetRef: "F-002" });
    await seedSuggestion(db, scene.p2, { key: "SG-1", targetRef: "F-001" });

    const { body } = await api().features(scene.p1.projectId);

    expect(itemOf(body, "F-001")?.openSuggestions).toBe(2);
    expect(itemOf(body, "F-002")?.openSuggestions).toBe(1);
  });
});

describe("clientSpace.features : pagination bornée", () => {
  it("limit et cursor : pages stables, même version, aucune perte ni doublon", async () => {
    const { sha } = await indexed([1, 2, 3, 4, 5].map((n) => feature(n)));

    const first = await api().features(scene.p1.projectId, "?limit=2");
    const second = await api().features(
      scene.p1.projectId,
      `?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
    );
    const third = await api().features(
      scene.p1.projectId,
      `?limit=2&cursor=${encodeURIComponent(second.body.nextCursor)}`,
    );

    const ids = [first, second, third].flatMap((page) =>
      page.body.items.map((i: { id: string }) => i.id),
    );
    expect(ids).toEqual(["F-001", "F-002", "F-003", "F-004", "F-005"]);
    expect(third.body.nextCursor).toBeNull();
    expect([first, second, third].map((page) => page.body.version)).toEqual([sha, sha, sha]);
  });

  it.each(["?limit=0", "?limit=101", "?limit=abc"])("%s : 422 VALIDATION", async (query) => {
    await indexed([feature(1)]);

    const res = await api().features(scene.p1.projectId, query);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
  });
});
