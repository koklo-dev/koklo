import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createReviewScene,
  P1_FEATURES,
  type ReviewScene,
  reviewApi,
  reviewRows,
} from "./helpers/reviews.ts";
import { deliverablesApi } from "./helpers/spec-deliverables.ts";
import { type EntitySeed, entity, featureEntities, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-109 lot A (B444, B449) : validation du livrable Données par l'équipe (owner, admin, développeur), statut recalculé sur
 * le contenu des tables, impact amont des fonctionnalités et règles citées par `source:` (À revoir + `staleUpstream`).
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
type Entry = { key: string; status: string; available: boolean; staleUpstream?: string[] };

const TABLE_DATA = { nom: "Utilisateur", source: ["F-002", "R-004"], champs: [] };
const base = (over: Partial<Record<string, string>> = {}): EntitySeed[] => [
  ...featureEntities(P1_FEATURES).map((e) =>
    over[e.specId] === undefined ? e : entity("feature", e.specId, over[e.specId]),
  ),
  entity("rule", "R-004", over["R-004"] ?? "a"),
  entity("roles", "roles", "a"),
  entity("flow", "P-001", "a"),
  entity("table", "T-user", over["T-user"] ?? "a", TABLE_DATA),
];
const p1 = () => scene.p1.projectId;
const as = (role: "owner" | "admin" | "dev" | "designer" | "business" | "client") =>
  reviewApi(bench().app, scene.p1.world.actors[role]);
const head = async (entities: EntitySeed[]) =>
  (await seedIndex(bench(), scene.p1, P1_FEATURES, { commit: true, entities })).sha;
const entries = async () => {
  const res = await deliverablesApi(bench().app, scene.p1.world.actors.owner).list(p1());
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return {
    list: Object.fromEntries((res.body.deliverables as Entry[]).map((e) => [e.key, e])) as Record<
      string,
      Entry
    >,
    validatedCount: res.body.validatedCount as number,
  };
};
const validateData = (role: "owner" | "admin" | "dev", version: string) =>
  as(role).submit(p1(), version, { targetKind: "deliverable", targetRef: "data" });
const validateFunctional = async (version: string) => {
  const client = reviewApi(bench().app, scene.c1);
  for (const [targetKind, targetRef] of [
    ["feature", "F-001"],
    ["feature", "F-002"],
    ["flow", "P-001"],
    ["rules", "rules"],
    ["roles", "roles"],
    ["deliverable", "functional"],
  ] as const) {
    const res = await client.submit(p1(), version, { targetKind, targetRef });
    expect(res.status, `${targetKind} ${targetRef} : ${JSON.stringify(res.body)}`).toBe(200);
  }
};

beforeEach(async () => {
  scene = await createReviewScene(bench());
});

describe("critère 1 : valider le modèle", () => {
  it.each(["owner", "admin", "dev"] as const)(
    "%s : 200, Données validé, validatedCount 2, Architecture disponible",
    async (role) => {
      const version = await head(base());
      await validateFunctional(version);
      const res = await validateData(role, version);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const { list, validatedCount } = await entries();
      expect(list.data?.status).toBe("validated");
      expect(validatedCount).toBe(2);
      expect(list.architecture?.available).toBe(true);
    },
  );
});

describe("critère 2 : modifier une table après la validation", () => {
  it("Données repasse à valider, la décision précédente reste au journal", async () => {
    const version = await head(base());
    await validateData("owner", version);
    expect((await entries()).list.data?.status).toBe("validated");

    await head(base({ "T-user": "modifiée" }));

    expect((await entries()).list.data?.status).toBe("pending");
    const rows = await reviewRows(bench().database, p1());
    expect(rows.filter((r) => r.target_ref === "data")).toHaveLength(1);
  });
});

describe("critère 3 : impact amont (B449)", () => {
  it("F-002 et R-004 modifiées après la décision : À revoir avec staleUpstream", async () => {
    const version = await head(base());
    await validateData("owner", version);
    expect((await entries()).list.data?.staleUpstream).toBeUndefined();

    await head(base({ "F-002": "modifiée", "R-004": "modifiée" }));

    const { list } = await entries();
    expect(list.data).toMatchObject({ status: "revise", staleUpstream: ["F-002", "R-004"] });
  });

  it("une nouvelle décision efface l'impact", async () => {
    const version = await head(base());
    await validateData("owner", version);
    const next = await head(base({ "F-002": "modifiée" }));
    expect((await entries()).list.data?.staleUpstream).toEqual(["F-002"]);

    expect((await validateData("owner", next)).status).toBe(200);

    const { list } = await entries();
    expect(list.data?.staleUpstream).toBeUndefined();
    expect(list.data?.status).toBe("validated");
  });

  it("jamais décidé : aucun impact, ni À revoir ni staleUpstream", async () => {
    await head(base());
    await head(base({ "F-002": "modifiée", "R-004": "modifiée" }));
    const { list } = await entries();
    expect(list.data?.staleUpstream).toBeUndefined();
    expect(list.data?.status).not.toBe("revise");
  });

  it("un amont non cité par une table, modifié, n'est pas un impact", async () => {
    const version = await head(base());
    await validateData("owner", version);
    await head(base({ "F-001": "modifiée" }));
    expect((await entries()).list.data?.staleUpstream).toBeUndefined();
  });
});
