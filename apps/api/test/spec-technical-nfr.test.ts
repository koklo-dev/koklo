import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import { nfrEntity, technicalApi } from "./helpers/spec-technical.ts";

/**
 * TK-116 lot A (cas 4, B772, B774) : onglet Exigences. `nfr.list` : ordre de l'index (catégorie puis identifiant), facettes
 * par catégorie, filtre, pages de 50, `around` ; aucun champ de couverture.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
const pad = (n: number) => String(n).padStart(3, "0");

const PERFORMANCE = Array.from({ length: 52 }, (_, n) =>
  nfrEntity(`NFR-${pad(n + 10)}`, { categorie: "performance" }),
);
const SEEDS = () => [
  nfrEntity("NFR-003", {
    categorie: "donnees",
    titre: "Effacement sur demande",
    cible: "30 jours",
    enonce: "Les données d'un client sont effacées sur demande.",
    verification: { mode: "scenario", detail: "Scénario S-7" },
    liens: ["C-api", "ST-api", "ADR-001", "R-001"],
  }),
  ...PERFORMANCE,
  nfrEntity("NFR-001", { categorie: "securite", verification: { mode: "manuel" } }),
  nfrEntity("NFR-002", { categorie: "exploitation", verification: { mode: "a_definir" } }),
];

async function seeded() {
  const s = await readScene(bench());
  await seedIndex(bench(), s, [], { commit: true, entities: SEEDS() });
  return { ...s, api: technicalApi(bench().app, s.world.actors.designer) };
}
const ids = (body: { items: { specId: string }[] }) => body.items.map((item) => item.specId);
const FACETS = { category: { data: 1, performance: 52, security: 1, operations: 1 } };

describe("spec.technical.nfr.list", () => {
  it("pages de 50 par catégorie puis identifiant, facettes, champs en anglais sans couverture", async () => {
    const s = await seeded();
    const first = await s.api.nfr(s.projectId);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.total).toBe(55);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.facets).toEqual(FACETS);
    expect(first.body.items[0]).toEqual({
      specId: "NFR-003",
      category: "data",
      title: "Effacement sur demande",
      target: "30 jours",
      statement: "Les données d'un client sont effacées sur demande.",
      verification: "scenario",
      verificationDetail: "Scénario S-7",
      links: ["C-api", "ST-api", "ADR-001", "R-001"],
      filePath: "nfr/NFR-003",
    });
    const next = await s.api.nfr(s.projectId, `?cursor=${first.body.nextCursor}`);
    expect(ids(next.body).slice(-2)).toEqual(["NFR-001", "NFR-002"]);
    expect(next.body.items.at(-2)).toMatchObject({ category: "security", verification: "manual" });
    expect(next.body.items.at(-1)).toMatchObject({ verification: "to_define" });
  });

  it("category filtre sans réduire les facettes ; around amène une exigence ; inconnue : 404", async () => {
    const s = await seeded();
    const filtered = await s.api.nfr(s.projectId, "?category=security");
    expect(ids(filtered.body)).toEqual(["NFR-001"]);
    expect(filtered.body.facets).toEqual(FACETS);
    const around = await s.api.nfr(s.projectId, "?around=NFR-002");
    expect(around.body.offset).toBe(50);
    expect(ids(around.body)).toContain("NFR-002");
    expect((await s.api.nfr(s.projectId, "?around=NFR-999")).status).toBe(404);
    expect((await s.api.nfr(s.projectId, "?category=autre")).status).toBe(400);
  });

  it("rien d'indexé : liste vide", async () => {
    const empty = await readScene(bench());
    const res = await technicalApi(bench().app, empty.world.actors.dev).nfr(empty.projectId);
    expect(res.body).toMatchObject({ items: [], total: 0, facets: { category: {} } });
  });
});
