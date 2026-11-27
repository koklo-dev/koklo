import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { batchRows, installSpecBench, operationRows } from "./helpers/spec-batch.ts";
import { securityApi, securityScene, threatEntity } from "./helpers/spec-security.ts";

/**
 * TK-117 lot B (cas 6, B807, B808) : menaces. Pages de 50 triées par surface puis identifiant (l'ordre de l'index),
 * filtres et recherche côté serveur, `around`, comptes de toute la tête, fiche avec son scénario d'abus, écritures par un
 * lot d'une seule opération (identifiant du compteur `threat`).
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach }, { waitMs: 200 });
// Worker arrêté : le lot reste en file, ses opérations sont lues telles que l'API les a enregistrées.
beforeEach(async () => bench().stopWorker());

const surfaceOf = (i: number) => (i <= 40 ? "F-001" : i <= 55 ? "F-002" : "api");
const id = (i: number) => `SEC-T${String(i).padStart(2, "0")}`;
const THREATS = () =>
  Array.from({ length: 60 }, (_, index) => {
    const i = index + 1;
    return threatEntity(id(i), {
      surfaces: [surfaceOf(i)],
      titre: i === 58 ? "Export du fichier par un compte volé" : `Menace ordinaire ${i}`,
      gravite: i % 10 === 0 ? "elevee" : "moyenne",
      parades: i === 10 || i === 58 ? [] : ["Une parade."],
      verification: { mode: i === 59 ? "controle_ci" : "scenario" },
      liens: i === 58 ? ["client.export", "RL-gerante"] : [],
    });
  });

const read = async () => {
  const s = await securityScene(bench(), THREATS());
  return { s, api: securityApi(bench().app, s.world.actors.dev) };
};
const ids = (body: { items: { id: string }[] }) => body.items.map((item) => item.id);

describe("security.threat.list", () => {
  it("première page de 50 dans l'ordre de l'index, comptes de la tête et titres de surface", async () => {
    const { s, api } = await read();
    const res = await api.threats(s.projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items).toHaveLength(50);
    expect(res.body.total).toBe(60);
    expect(ids(res.body)[0]).toBe("SEC-T01");
    expect(res.body.items[0]).toMatchObject({
      surface: "F-001",
      severity: "medium",
      category: "abuse",
      status: "ok",
      verification: "scenario",
    });
    expect(res.body.facets.status).toEqual({ total: 60, todo: 2, todoHigh: 1, high: 6 });
    expect(res.body.facets.surface).toEqual({ "F-001": 40, "F-002": 15, api: 5 });
    expect(res.body.surfaces).toEqual([
      { id: "F-001", title: "Réserver en ligne" },
      { id: "F-002", title: "Fichier clientes" },
      { id: "api", title: "API, secrets et intégrations" },
    ]);
    const next = await api.threats(s.projectId, `?cursor=${res.body.nextCursor}`);
    expect(ids(next.body)).toEqual(Array.from({ length: 10 }, (_, i) => id(i + 51)));
  });

  it("filtres gravité élevée, à traiter et CI ; les comptes ne changent pas", async () => {
    const { s, api } = await read();
    const high = await api.threats(s.projectId, "?filter=high");
    expect(high.body.total).toBe(6);
    const todo = await api.threats(s.projectId, "?filter=todo");
    expect(ids(todo.body)).toEqual(["SEC-T10", "SEC-T58"]);
    expect(todo.body.items[0].status).toBe("todo");
    const ci = await api.threats(s.projectId, "?filter=ci");
    expect(ids(ci.body)).toEqual(["SEC-T59"]);
    expect(ci.body.facets.status.total).toBe(60);
  });

  it("q trouve hors de la première page ; around amène la menace dans sa page", async () => {
    const { s, api } = await read();
    const found = await api.threats(s.projectId, "?q=export");
    expect(ids(found.body)).toEqual(["SEC-T58"]);
    const around = await api.threats(s.projectId, "?around=SEC-T58");
    expect(around.body.offset).toBe(50);
    expect(ids(around.body)).toContain("SEC-T58");
  });

  it("spec sans menace indexée : liste vide, comptes à zéro", async () => {
    const s = await securityScene(bench(), []);
    const res = await securityApi(bench().app, s.world.actors.owner).threats(s.projectId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], total: 0 });
    expect(res.body.facets.status).toEqual({ total: 0, todo: 0, todoHigh: 0, high: 0 });
  });
});

describe("security.threat.byId", () => {
  it("fiche complète, scénario d'abus tel qu'écrit par le worker", async () => {
    const { s, api } = await read();
    const res = await api.threat(s.projectId, "SEC-T58");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      id: "SEC-T58",
      status: "todo",
      risk: "Un abus est possible.",
      measures: [],
      links: ["client.export", "RL-gerante"],
      surfaceTitles: [{ id: "api", title: "API, secrets et intégrations" }],
      scenarioPath: "quality/scenarios/abuse/SEC-T58.feature",
      commitSha: s.sha,
    });
    expect(res.body.gherkin).toContain("@SEC-T58 @api @abus");
    expect(res.body.gherkin).toContain("Scénario: Export du fichier par un compte volé");
    const ci = await api.threat(s.projectId, "SEC-T59");
    expect(ci.body).toMatchObject({ gherkin: "", scenarioPath: null });
    expect((await api.threat(s.projectId, "SEC-T99")).status).toBe(404);
  });
});

describe("security.threat.create et update", () => {
  it("un lot d'une seule opération, identifiant du compteur ; modification d'une menace connue", async () => {
    const { s, api } = await read();
    await bench().database.query(
      "INSERT INTO project_counters (organization_id, project_id, name, last_value, updated_at) VALUES ($1, $2, 'threat', 60, now())",
      [s.organizationId, s.projectId],
    );
    const created = await api.createThreat(s.projectId);
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.results).toEqual([
      { position: 0, kind: "threat.create", specId: "SEC-T61" },
    ]);
    const updated = await api.updateThreat(s.projectId, "SEC-T58", {
      measures: ["Second facteur à l'export."],
    });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    const rows = await batchRows(bench().database, s.projectId);
    expect(rows).toHaveLength(2);
    expect(await operationRows(bench().database, rows[1]?.id ?? "")).toMatchObject([
      {
        kind: "threat.update",
        target_spec_id: "SEC-T58",
        payload: { measures: ["Second facteur à l'export."] },
      },
    ]);
    expect((await api.updateThreat(s.projectId, "SEC-T99", { severity: "low" })).status).toBe(404);
  });
});
