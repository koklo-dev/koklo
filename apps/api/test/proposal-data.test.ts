import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench, setKey } from "./helpers/ai-bench.ts";
import { insertProposal, launchRows, proposalApi } from "./helpers/proposals.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-107 lot B (cas 8, 10, 12) : `ai.proposeDeliverable` et `ai.proposeOptions` pour le livrable `data`. Modes `complete` et
 * `all` seuls, au moins une entité du Fonctionnel (pas de version d'idée figée exigée), « L'agent lit » propre aux Données,
 * designer refusé ; contenu d'une table corrigé à la main revalidé par `proposal.decide`.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

const READS = [
  "functional.features",
  "functional.rules",
  "functional.roles",
  "functional.flows",
  "data.current",
];

async function dataScene(withFunctional = true) {
  const b = bench();
  const scene = await readScene(b);
  await setKey(b.app, scene.world, "FAKE-KEY-NOT-REAL-0107");
  b.use(FakeLlm.replying({}));
  if (withFunctional) await seedIndex(b, scene, [{ id: "F-001", titre: "Réserver une salle" }]);
  return { b, scene, world: scene.world };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("ai.proposeDeliverable data (cas 10)", () => {
  it("complete puis all : acceptés, lancement data sans version d'idée, lectures propres aux Données", async () => {
    const { b, world } = await dataScene();
    const api = proposalApi(b.app, world.actors.dev);

    const first = await api.propose(world.projectId, { deliverable: "data", mode: "complete" });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.status).toBe("queued");
    await b.database.query("UPDATE agent_launches SET status = 'done' WHERE project_id = $1", [
      world.projectId,
    ]);
    const second = await api.propose(world.projectId, { deliverable: "data", mode: "all" });
    expect(second.status, JSON.stringify(second.body)).toBe(200);

    const rows = await launchRows(b.database, world.projectId);
    expect(rows.map((r) => [r.deliverable, r.mode, r.base_version])).toEqual([
      ["data", "complete", null],
      ["data", "all", null],
    ]);
    expect(rows[0]?.sources).toEqual(READS);
  });

  it.each(["criteria", "update"])("mode %s : 422 VALIDATION, aucun lancement", async (mode) => {
    const { b, world } = await dataScene();
    const res = await proposalApi(b.app, world.actors.dev).propose(world.projectId, {
      deliverable: "data",
      mode,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
  });

  it("sans entité du Fonctionnel : 422 VALIDATION, aucun lancement", async () => {
    const { b, world } = await dataScene(false);
    const res = await proposalApi(b.app, world.actors.dev).propose(world.projectId, {
      deliverable: "data",
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
  });

  it("une règle seule suffit comme entité du Fonctionnel", async () => {
    const { b, scene, world } = await dataScene(false);
    const { entity } = await import("./helpers/spec-read.ts");
    await seedIndex(b, scene, [], {
      entities: [entity("rule", "R-001", "r", { titre: "Annulation" })],
    });
    const res = await proposalApi(b.app, world.actors.dev).propose(world.projectId, {
      deliverable: "data",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("le designer : 403 FORBIDDEN, aucun lancement ; le Fonctionnel reste ouvert au designer", async () => {
    const { b, world } = await dataScene();
    const res = await proposalApi(b.app, world.actors.designer).propose(world.projectId, {
      deliverable: "data",
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
  });

  it.each(["client", "business"] as const)("%s : 403 sur propose et options", async (role) => {
    const { b, world } = await dataScene();
    const api = proposalApi(b.app, world.actors[role]);
    expect((await api.propose(world.projectId, { deliverable: "data" })).status).toBe(403);
    expect((await api.options(world.projectId, "data")).status).toBe(403);
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
  });
});

describe("ai.proposeOptions data (cas 10)", () => {
  it("deux options, complete recommandée puis all ; lectures « Cahier fonctionnel, règles, rôles, parcours, modèle actuel »", async () => {
    const { b, world } = await dataScene();
    const res = await proposalApi(b.app, world.actors.dev).options(world.projectId, "data");
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.options).toEqual([
      { id: "complete", recommended: true },
      { id: "all", recommended: false },
    ]);
    expect(res.body.reads.map((r: { label: string }) => r.label)).toEqual([
      "Cahier fonctionnel",
      "Règles",
      "Rôles",
      "Parcours",
      "Modèle actuel",
    ]);
    expect(res.body.reads.map((r: { id: string }) => r.id)).toEqual(READS);
  });
});

const TABLE = {
  name: "Réservation",
  fields: [{ name: "id", type: "uuid", primaryKey: true }],
};

describe("proposal.decide sur une table (cas 12)", () => {
  async function pendingTable() {
    const { b, world } = await dataScene();
    const scope = { organizationId: world.organizationId, projectId: world.projectId };
    const { id } = await insertProposal(b.database, scope, {
      deliverable: "data",
      kind: "table",
      zone: "Réservations",
      title: "Réservation",
      payload: TABLE,
    });
    return { b, world, id };
  }

  it("contenu corrigé valide : accepté, titre = nom ; contenu invalide (type hors vocabulaire, lien) : 422, rien de modifié", async () => {
    const { b, world, id } = await pendingTable();
    const api = proposalApi(b.app, world.actors.dev);
    for (const edited of [
      { ...TABLE, fields: [{ name: "id", type: "varchar" }] },
      { ...TABLE, name: "voir https://exemple.fr" },
    ]) {
      const res = await api.decide(world.projectId, id, "accept", { edited });
      expect(res.status, JSON.stringify(edited)).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
    }
    const ok = await api.decide(world.projectId, id, "accept", {
      edited: { ...TABLE, name: "Séjour" },
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ kind: "table", title: "Séjour", status: "accepted" });
  });
});

/**
 * TK-110 lot A (B487) : 67 propositions des Données (> 30) = groupes par zone de table + « Relations et jeux d'exemple » ;
 * « Accepter les N » du groupe ne décide que les relations et les jeux, jamais les tables.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("proposal.list et decideMany : groupe « links » des Données", () => {
  async function dataLaunch() {
    const { b, world } = await dataScene();
    const scope = { organizationId: world.organizationId, projectId: world.projectId };
    let launchId: string | undefined;
    let position = 0;
    const add = async (kind: string, zone: string, count: number) => {
      for (let i = 0; i < count; i += 1) {
        const made = await insertProposal(b.database, scope, {
          launchId,
          deliverable: "data",
          kind,
          zone,
          position: position++,
          title: `${kind} ${zone} ${i}`,
          payload: TABLE,
        });
        launchId = made.launchId;
      }
    };
    await add("table", "Rendez-vous", 20);
    await add("table", "Clients", 20);
    await add("table", "Paiements", 20);
    await add("relations", "Rendez-vous", 4);
    await add("fixtures", "Clients", 3);
    return { b, world, launchId: launchId as string };
  }

  it("67 propositions : trois groupes de tables par zone puis « links », relations et jeux ensemble", async () => {
    const { b, world } = await dataLaunch();
    const api = proposalApi(b.app, world.actors.dev);
    const res = await api.list(world.projectId, { deliverable: "data", limit: "5" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.groups.map((g: { key: string; total: number }) => [g.key, g.total])).toEqual([
      ["table:Rendez-vous", 20],
      ["table:Clients", 20],
      ["table:Paiements", 20],
      ["links", 7],
    ]);
    expect(res.body.groups[3].label).toBe("Relations et jeux d'exemple");
    const links = await api.list(world.projectId, {
      deliverable: "data",
      group: "links",
      limit: "100",
    });
    expect(links.body.total).toBe(7);
    expect(links.body.items.map((item: { kind: string }) => item.kind).sort()).toEqual([
      "fixtures",
      "fixtures",
      "fixtures",
      "relations",
      "relations",
      "relations",
      "relations",
    ]);
  });

  it("« Accepter les 7 » du groupe links : relations et jeux acceptés, tables intactes ; N périmé refusé", async () => {
    const { b, world, launchId } = await dataLaunch();
    const api = proposalApi(b.app, world.actors.dev);
    const stale = await api.decideMany(world.projectId, {
      launchId,
      group: "links",
      expectedPending: 8,
    });
    expect(stale.status).toBe(409);
    const ok = await api.decideMany(world.projectId, {
      launchId,
      group: "links",
      expectedPending: 7,
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toEqual({ decided: 7 });
    const rows = await b.database.query<{ kind: string; status: string; n: number }>(
      `SELECT kind, status, count(*)::int AS n FROM agent_proposals WHERE project_id = $1 GROUP BY kind, status ORDER BY kind, status`,
      [world.projectId],
    );
    expect(rows.map((r) => [r.kind, r.status, r.n])).toEqual([
      ["fixtures", "accepted", 3],
      ["relations", "accepted", 4],
      ["table", "pending", 60],
    ]);
  });
});
