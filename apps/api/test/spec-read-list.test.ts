import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  type FeatureSeed,
  readScene,
  type SpecReadScene,
  seedIndex,
  specReadApi,
} from "./helpers/spec-read.ts";
import { createWorld } from "./helpers/tickets.ts";

/** TK-45c2 : spec.listFeatures (filtres, tri numérique sur F-nnn, pagination, instantané failed). */
const bench = installBench({ beforeAll, afterAll, beforeEach });

const listOf = (s: SpecReadScene, query = "") =>
  specReadApi(bench().app, s.world.actors.dev).list(s.projectId, query);
const idsOf = (body: { items: { specId: string }[] }) => body.items.map((item) => item.specId);
const feature = (n: number, over: Partial<FeatureSeed> = {}): FeatureSeed => ({
  id: `F-${String(n).padStart(3, "0")}`,
  titre: `Feature ${n}`,
  ...over,
});

describe("spec.listFeatures : contenu d'un résumé", () => {
  it("specId, title, status, priority, filePath, criteriaCount, rien d'autre", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [
      feature(1, {
        titre: "Connexion",
        statut: "specifiee",
        priorite: "must",
        criteres: [{ titre: "a" }, { titre: "b" }, { titre: "c" }],
      }),
      feature(2, { titre: "Sans critère" }),
    ]);

    const res = await listOf(s);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          specId: "F-001",
          title: "Connexion",
          status: "specifiee",
          priority: "must",
          filePath: "features/F-001-connexion.md",
          criteriaCount: 3,
        },
        {
          specId: "F-002",
          title: "Sans critère",
          status: "brouillon",
          priority: "should",
          filePath: "features/F-002-sans-critere.md",
          criteriaCount: 0,
        },
      ],
      nextCursor: null,
    });
  });

  it("projet sans dépôt, sans tête ou branche inconnue : page vide", async () => {
    const world = await createWorld(bench().database);
    const noRepo = await specReadApi(bench().app, world.actors.dev).list(world.projectId);
    const s = await readScene(bench());
    const noHead = await listOf(s);
    await seedIndex(bench(), s, [feature(1)]);
    const unknown = await listOf(s, "?branch=inconnue");

    for (const res of [noRepo, noHead, unknown]) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    }
  });
});

describe("spec.listFeatures : filtres", () => {
  const seeds: FeatureSeed[] = [
    feature(1, { statut: "brouillon", priorite: "must" }),
    feature(2, { statut: "specifiee", priorite: "must" }),
    feature(3, { statut: "specifiee", priorite: "could" }),
    feature(4, { statut: "adoptee", priorite: "wont" }),
  ];

  it.each([
    ["status=specifiee", ["F-002", "F-003"]],
    ["priority=must", ["F-001", "F-002"]],
    ["status=specifiee&priority=could", ["F-003"]],
    ["status=implementee", []],
    ["priority=wont&status=adoptee", ["F-004"]],
  ])("?%s", async (query, expected) => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, seeds);

    const res = await listOf(s, `?${query}`);

    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual(expected);
  });

  it("statut, priorité ou limite invalides : 422 VALIDATION (route déclarée comme les commentaires)", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, seeds);

    for (const query of ["?status=done", "?priority=high", "?limit=0", "?limit=101"]) {
      const res = await listOf(s, query);
      expect(res.status, query).toBe(422);
      expect(res.body.code, query).toBe("VALIDATION");
    }
  });
});

describe("spec.listFeatures : révision lue", () => {
  it("lit les entités de l'instantané pointé par la tête, pas celles des anciens commits", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [feature(1), feature(2)], { noHead: true });
    await seedIndex(bench(), s, [feature(1, { titre: "Renommée" }), feature(3)]);

    const res = await listOf(s);

    expect(idsOf(res.body)).toEqual(["F-001", "F-003"]);
    expect(res.body.items[0].title).toBe("Renommée");
  });

  it("?branch= et ?commitSha= choisissent la révision ; les deux ensemble : 422 VALIDATION", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [feature(1)], { branch: "cadrage" });
    const other = await seedIndex(bench(), s, [feature(2), feature(3)], { branch: "change-1" });

    const byBranch = await listOf(s, "?branch=change-1");
    const byCommit = await listOf(s, `?commitSha=${other.sha}`);
    const both = await listOf(s, `?branch=change-1&commitSha=${other.sha}`);

    expect(idsOf(byBranch.body)).toEqual(["F-002", "F-003"]);
    expect(idsOf(byCommit.body)).toEqual(["F-002", "F-003"]);
    expect(both.status).toBe(422);
    expect(both.body.code).toBe("VALIDATION");
  });

  it("ne mélange pas les features d'un autre projet ni d'une autre organisation", async () => {
    const b = bench();
    const mine = await readScene(b);
    await seedIndex(b, mine, [feature(1)]);
    const theirs = await readScene(b, { world: await createWorld(b.database) });
    await seedIndex(b, theirs, [feature(9, { titre: "Etrangere" })]);

    const res = await listOf(mine);

    expect(idsOf(res.body)).toEqual(["F-001"]);
    expect(JSON.stringify(res.body)).not.toContain("Etrangere");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.listFeatures : tri numérique et pagination", () => {
  it("trie par numéro de F-nnn : F-999 avant F-1000, F-002 avant F-010", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [
      { id: "F-1000" },
      { id: "F-010" },
      { id: "F-999" },
      { id: "F-002" },
      { id: "F-100" },
    ]);

    const res = await listOf(s);

    expect(idsOf(res.body)).toEqual(["F-002", "F-010", "F-100", "F-999", "F-1000"]);
  });

  it("pagine par curseur opaque sans trou ni doublon, dans l'ordre numérique", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [
      { id: "F-1000" },
      { id: "F-999" },
      { id: "F-003" },
      { id: "F-001" },
      { id: "F-002" },
    ]);

    const page1 = await listOf(s, "?limit=2");
    const page2 = await listOf(s, `?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`);
    const page3 = await listOf(s, `?limit=2&cursor=${encodeURIComponent(page2.body.nextCursor)}`);

    expect(idsOf(page1.body)).toEqual(["F-001", "F-002"]);
    expect(typeof page1.body.nextCursor).toBe("string");
    expect(idsOf(page2.body)).toEqual(["F-003", "F-999"]);
    expect(idsOf(page3.body)).toEqual(["F-1000"]);
    expect(page3.body.nextCursor).toBeNull();
  });

  it("limite par défaut 50 : 55 features = 50 puis 5", async () => {
    const s = await readScene(bench());
    await seedIndex(
      bench(),
      s,
      Array.from({ length: 55 }, (_, i) => feature(i + 1)),
    );

    const first = await listOf(s);
    const second = await listOf(s, `?cursor=${encodeURIComponent(first.body.nextCursor)}`);

    expect(first.body.items).toHaveLength(50);
    expect(second.body.items).toHaveLength(5);
    expect(second.body.nextCursor).toBeNull();
  });

  it("un curseur mal formé est refusé : 422 VALIDATION sur le champ cursor", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [feature(1)]);

    const res = await listOf(s, "?cursor=pas-un-curseur");

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(res.body.data.field).toBe("cursor");
  });

  it("filtres et pagination se combinent", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [
      feature(1, { priorite: "must" }),
      feature(2, { priorite: "could" }),
      feature(3, { priorite: "must" }),
      feature(4, { priorite: "must" }),
    ]);

    const page1 = await listOf(s, "?priority=must&limit=2");
    const page2 = await listOf(
      s,
      `?priority=must&limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`,
    );

    expect(idsOf(page1.body)).toEqual(["F-001", "F-003"]);
    expect(idsOf(page2.body)).toEqual(["F-004"]);
    expect(page2.body.nextCursor).toBeNull();
  });
});

describe("spec.listFeatures : instantané failed", () => {
  it("409 SPEC_INDEX_FAILED { errorCode, commitSha } au lieu d'une page vide", async () => {
    const s = await readScene(bench());
    const { sha } = await seedIndex(bench(), s, [], {
      status: "failed",
      errorCode: "spec_too_large",
    });

    const res = await listOf(s);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SPEC_INDEX_FAILED");
    expect(res.body.data).toEqual({ errorCode: "spec_too_large", commitSha: sha });
  });

  it("la même erreur vaut avec ?branch= ; l'erreur ne contient ni message ni chemin interne", async () => {
    const s = await readScene(bench());
    await seedIndex(bench(), s, [], {
      branch: "change-1",
      status: "failed",
      errorCode: "repo_not_found",
    });

    const res = await listOf(s, "?branch=change-1");

    expect(res.status).toBe(409);
    expect(res.body.data.errorCode).toBe("repo_not_found");
    expect(Object.keys(res.body.data).sort()).toEqual(["commitSha", "errorCode"]);
  });
});
