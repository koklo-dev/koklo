import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { batchRows, installSpecBench, operationRows } from "./helpers/spec-batch.ts";
import { asvsEntity, entryEntity, securityApi, securityScene } from "./helpers/spec-security.ts";

/**
 * TK-117 lot B (A6, B797, B798, B799) : niveau 2 recommandé dès une donnée personnelle, choix humain conservé,
 * couverture par chapitre sur les exigences du niveau, « À vérifier » sans exigence, faits « Secrets et dépendances ».
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach }, { waitMs: 200 });
// Worker arrêté : le lot reste en file, ses opérations sont lues telles que l'API les a enregistrées.
beforeEach(async () => bench().stopWorker());

const requirement = (id: string, chapitre: string, niveau: number, reponse?: string) => ({
  id,
  chapitre,
  titre: `Exigence ${id}`,
  niveau,
  ...(reponse === undefined ? {} : { reponse }),
});

const report = async (entities: Parameters<typeof securityScene>[1]) => {
  const s = await securityScene(bench(), entities);
  const api = securityApi(bench().app, s.world.actors.dev);
  const res = await api.asvs(s.projectId);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return { s, api, body: res.body };
};

describe("security.asvs.report", () => {
  it("sans donnée personnelle : niveau 1 recommandé, neuf chapitres « à vérifier »", async () => {
    const { body } = await report([entryEntity("t.a")]);
    expect(body).toMatchObject({ level: 1, recommendedLevel: 1, chosen: false, total: 0 });
    expect(body.chapters).toHaveLength(9);
    expect(body.chapters.every((c: { status: string }) => c.status === "to_check")).toBe(true);
    expect(body.facts).toEqual([]);
  });

  it("une donnée personnelle : niveau 2 ; couverture, où c'est répondu et faits", async () => {
    const { body } = await report([
      entryEntity("t.a", { categorie: "contact" }),
      asvsEntity({
        exigences: [
          requirement("V1", "sessions", 1, "30 minutes"),
          requirement("V2", "sessions", 2),
          requirement("V3", "api", 3, "Contrat"),
        ],
        secrets_et_dependances: [{ libelle: "Secrets", valeur: "Coffre" }],
      }),
    ]);
    expect(body).toMatchObject({ level: 2, recommendedLevel: 2, answered: 1, total: 2 });
    const chapter = (name: string) =>
      body.chapters.find((entry: { chapter: string }) => entry.chapter === name);
    expect(chapter("sessions")).toEqual({
      chapter: "sessions",
      answered: 1,
      total: 2,
      where: ["30 minutes"],
      status: "missing",
    });
    expect(chapter("api")).toMatchObject({ total: 0, status: "to_check" });
    expect(body.facts).toEqual([{ label: "Secrets", value: "Coffre" }]);
  });

  it("le choix humain l'emporte ; « setLevel » écrit un lot asvs.set_level", async () => {
    const { s, api, body } = await report([
      entryEntity("t.a", { categorie: "sensible" }),
      asvsEntity({ niveau: 3 }),
    ]);
    expect(body).toMatchObject({ level: 3, recommendedLevel: 2, chosen: true });
    const res = await api.setLevel(s.projectId, 1);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.results).toEqual([{ position: 0, kind: "asvs.set_level", specId: null }]);
    const [batch] = await batchRows(bench().database, s.projectId);
    expect(await operationRows(bench().database, batch?.id ?? "")).toMatchObject([
      { kind: "asvs.set_level", target_spec_id: null, payload: { level: 1 } },
    ]);
    const features = await bench().database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM project_counters WHERE project_id = $1 AND name = 'feature' AND last_value > 2",
      [s.projectId],
    );
    expect(features[0]?.n).toBe(0);
  });
});
