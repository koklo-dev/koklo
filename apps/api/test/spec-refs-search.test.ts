import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { insertItems, itemApi, volumeFeatures } from "./helpers/spec-items.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-101 lot A (B329 e, contrat 2.11.0) : `spec.refs.search`. Autocomplétion des liens du panneau d'édition : l'index
 * `spec_entities` de la tête, 20 résultats au plus, préfixe d'identifiant OU mot du titre, trié par `sort` puis `id`.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

const volumeScene = async (indexed = true) => {
  const s = await readScene(bench());
  const { snapshotId } = await seedIndex(bench(), s, [{ id: "F-001", titre: "Connexion" }]);
  await insertItems(bench().database, s, snapshotId, volumeFeatures(), { indexed });
  return { s, snapshotId };
};
const search = (
  s: Awaited<ReturnType<typeof readScene>>,
  q: string,
  kinds: readonly string[] = ["feature"],
  role: "dev" | "client" | "business" = "dev",
) => itemApi(bench().app, s.world.actors[role]).search(s.projectId, kinds, q);
const idsOf = (body: { items: { specId: string }[] }) => body.items.map((item) => item.specId);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.refs.search", () => {
  it("retrouve un élément hors de la première page par identifiant partiel, et par mot du titre", async () => {
    const { s } = await volumeScene();

    const byId = await search(s, "F-987");
    expect(byId.status, JSON.stringify(byId.body)).toBe(200);
    expect(byId.body.items).toEqual([
      { kind: "feature", specId: "F-987", title: "Gérer les réservations (987)" },
    ]);
    const byWord = await search(s, "annulation");
    expect(byWord.body.items).toEqual([
      { kind: "feature", specId: "F-703", title: "Annulation groupée des réservations" },
    ]);
    expect(idsOf((await search(s, "f-98")).body)).toEqual(
      Array.from({ length: 10 }, (_, n) => `F-98${n}`),
    );
  });

  it("20 résultats au plus, triés par rang ; q vide : les 20 premiers", async () => {
    const { s } = await volumeScene();

    const wide = await search(s, "réservations");
    expect(wide.body.items).toHaveLength(20);
    expect(idsOf(wide.body)).toEqual(idsOf(wide.body).slice().sort());
    const empty = await search(s, "");
    expect(idsOf(empty.body)).toEqual(
      Array.from({ length: 20 }, (_, n) => `F-${String(n + 1).padStart(3, "0")}`),
    );
    expect(Object.keys(empty.body)).toEqual(["items"]);
  });

  it("filtre par genre : les règles et les tables ne sortent que si elles sont demandées", async () => {
    const s = await readScene(bench());
    const { snapshotId } = await seedIndex(bench(), s, [{ id: "F-001", titre: "Connexion" }]);
    await insertItems(bench().database, s, snapshotId, [
      { kind: "feature", specId: "F-001", data: { titre: "Connexion" }, sort: 1 },
      { kind: "rule", specId: "R-001", data: { titre: "Délai de connexion" }, sort: 1 },
      { kind: "table", specId: "T-user", data: { titre: "Utilisateurs" }, sort: 1 },
    ]);

    expect((await search(s, "", ["rule"])).body.items).toEqual([
      { kind: "rule", specId: "R-001", title: "Délai de connexion" },
    ]);
    expect(idsOf((await search(s, "", ["rule", "table"])).body).sort()).toEqual([
      "R-001",
      "T-user",
    ]);
    expect(idsOf((await search(s, "connexion", ["feature", "rule"])).body).sort()).toEqual([
      "F-001",
      "R-001",
    ]);
  });

  it("snapshot non indexé en entités (entities_indexed_at nul) : liste vide, pas une erreur", async () => {
    const { s } = await volumeScene(false);
    const res = await search(s, "F-987");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it("un caractère de motif (%, _) dans q n'est pas un joker ; entrée hors bornes : 400", async () => {
    const { s } = await volumeScene();
    expect((await search(s, "%")).body.items).toEqual([]);
    expect((await search(s, "_")).body.items).toEqual([]);
    expect((await search(s, "x".repeat(101))).status).toBe(400);
    expect((await search(s, "", [])).status).toBe(400);
    expect((await search(s, "", ["test"])).status).toBe(400);
  });

  it("client et business : 403 ; projet d'une autre organisation : 404", async () => {
    const { s } = await volumeScene();
    for (const role of ["client", "business"] as const) {
      expect((await search(s, "", ["feature"], role)).status, role).toBe(403);
    }
    const other = await readScene(bench());
    const res = await itemApi(bench().app, other.world.actors.dev).search(s.projectId, ["feature"]);
    expect(res.status).toBe(404);
  });
});
