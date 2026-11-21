import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench, setKey } from "./helpers/ai-bench.ts";
import { insertProposal, launchRows, proposalApi } from "./helpers/proposals.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-111 lot B (cas 5, B510) : `ai.proposeDeliverable` et `ai.proposeOptions` pour le livrable `architecture`. Quatre modes
 * (compléter, décision, document, tout reproposer), livrable ouvert (Données validées ou forçage), au moins une entité du
 * Fonctionnel, owner, admin et développeur seuls (designer 403), un seul lancement actif ; propositions typées relues par
 * `proposal.decide` (contenu revalidé).
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

const READS = [
  "functional.features",
  "functional.rules",
  "functional.roles",
  "functional.flows",
  "data.tables",
  "architecture.current",
  "nfr.known",
];

/** Projet avec clé, fonctionnalité indexée ; `open` : l'architecture est ouverte par un forçage de l'owner. */
async function archScene({ functional = true, open = true } = {}) {
  const b = bench();
  const scene = await readScene(b);
  await setKey(b.app, scene.world, "FAKE-KEY-NOT-REAL-0111");
  b.use(FakeLlm.replying({}));
  if (functional) await seedIndex(b, scene, [{ id: "F-001", titre: "Réserver une salle" }]);
  if (open) {
    const forced = await send(
      b.app,
      scene.world.actors.owner.cookie,
      "post",
      `/projects/${scene.world.projectId}/spec/deliverables/architecture/force`,
      { projectId: scene.world.projectId, key: "architecture", confirm: true },
    );
    expect(forced.status, JSON.stringify(forced.body)).toBe(200);
  }
  return { b, scene, world: scene.world };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("ai.proposeDeliverable architecture (cas 5)", () => {
  it.each(["complete", "decision", "document", "all"])(
    "mode %s : accepté, lancement architecture sans version d'idée, lectures propres à l'architecture",
    async (mode) => {
      const { b, world } = await archScene();
      const res = await proposalApi(b.app, world.actors.dev).propose(world.projectId, {
        deliverable: "architecture",
        mode,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.status).toBe("queued");
      const rows = await launchRows(b.database, world.projectId);
      expect(rows.map((r) => [r.deliverable, r.mode, r.base_version])).toEqual([
        ["architecture", mode, null],
      ]);
      expect(rows[0]?.sources).toEqual(READS);
    },
  );

  it.each(["criteria", "update"])("mode %s : 422 VALIDATION, aucun lancement", async (mode) => {
    const { b, world } = await archScene();
    const res = await proposalApi(b.app, world.actors.dev).propose(world.projectId, {
      deliverable: "architecture",
      mode,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
  });

  it("livrable pas encore ouvert (données non validées, aucun forçage) : 422 VALIDATION, aucun lancement", async () => {
    const { b, world } = await archScene({ open: false });
    const res = await proposalApi(b.app, world.actors.owner).propose(world.projectId, {
      deliverable: "architecture",
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
  });

  it("sans entité du Fonctionnel : 422 VALIDATION, aucun lancement", async () => {
    const { b, world } = await archScene({ functional: false });
    const res = await proposalApi(b.app, world.actors.dev).propose(world.projectId, {
      deliverable: "architecture",
    });
    expect(res.status).toBe(422);
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
  });

  it("un seul lancement actif : le second reçoit 409 PROPOSAL_IN_PROGRESS avec le lancement en cours", async () => {
    const { b, world } = await archScene();
    const api = proposalApi(b.app, world.actors.dev);
    const first = await api.propose(world.projectId, { deliverable: "architecture" });
    const second = await api.propose(world.projectId, { deliverable: "architecture" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("PROPOSAL_IN_PROGRESS");
    expect(second.body.data.launchId).toBe(first.body.launchId);
  });

  it.each(["owner", "admin", "dev"] as const)("%s propose", async (role) => {
    const { b, world } = await archScene();
    const res = await proposalApi(b.app, world.actors[role]).propose(world.projectId, {
      deliverable: "architecture",
    });
    expect(res.status, role).toBe(200);
  });

  it("le designer : 403 FORBIDDEN, aucun lancement", async () => {
    const { b, world } = await archScene();
    const res = await proposalApi(b.app, world.actors.designer).propose(world.projectId, {
      deliverable: "architecture",
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
  });

  it.each(["client", "business"] as const)("%s : 403 sur propose et options", async (role) => {
    const { b, world } = await archScene();
    const api = proposalApi(b.app, world.actors[role]);
    expect((await api.propose(world.projectId, { deliverable: "architecture" })).status).toBe(403);
    expect((await api.options(world.projectId, "architecture")).status).toBe(403);
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
  });
});

describe("ai.proposeOptions architecture (cas 5)", () => {
  it("quatre options, compléter recommandée ; lectures « Cahier fonctionnel, règles, rôles, parcours, modèle de données, architecture actuelle, exigences connues »", async () => {
    const { b, world } = await archScene();
    const res = await proposalApi(b.app, world.actors.dev).options(world.projectId, "architecture");
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.options).toEqual([
      { id: "complete", recommended: true },
      { id: "decision", recommended: false },
      { id: "document", recommended: false },
      { id: "all", recommended: false },
    ]);
    // Les trois puces de la maquette 13 l.869 ; le contexte réel de l'agent (READS) reste dans `sources`.
    expect(res.body.reads).toEqual([
      { id: "functional.features", label: "Fonctionnel" },
      { id: "data.tables", label: "Données" },
      { id: "nfr.known", label: "Exigences connues" },
    ]);
  });
});

const COMPONENT = { name: "API", type: "service", zone: "Noyau", responsibility: "Expose." };

describe("proposal.decide sur les types de l'architecture (cas 5)", () => {
  async function pending(kind: string, payload: object, title: string) {
    const { b, world } = await archScene();
    const scope = { organizationId: world.organizationId, projectId: world.projectId };
    const { id } = await insertProposal(b.database, scope, {
      deliverable: "architecture",
      kind,
      zone: "Noyau",
      title,
      payload,
    });
    return { b, world, id };
  }

  it("composant : contenu corrigé valide accepté (titre = nom), invalide (type hors liste, lien) refusé en 422", async () => {
    const { b, world, id } = await pending("component", COMPONENT, "API");
    const api = proposalApi(b.app, world.actors.dev);
    for (const edited of [
      { ...COMPONENT, type: "lambda" },
      { ...COMPONENT, name: "voir https://exemple.fr" },
    ]) {
      const res = await api.decide(world.projectId, id, "accept", { edited });
      expect(res.status, JSON.stringify(edited)).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
    }
    const ok = await api.decide(world.projectId, id, "accept", {
      edited: { ...COMPONENT, name: "Passerelle" },
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ kind: "component", title: "Passerelle", status: "accepted" });
  });

  it("flux : titre = parcours détaillé ; décision et section : titre du contenu", async () => {
    const flow = {
      flow: "P-reserver",
      participants: ["RL-client", "C-api"],
      messages: [{ from: "RL-client", to: "C-api", text: "Réserve" }],
    };
    const a = await pending("archflow", flow, "?");
    const res = await proposalApi(a.b.app, a.world.actors.dev).decide(
      a.world.projectId,
      a.id,
      "accept",
      { edited: flow },
    );
    expect(res.body).toMatchObject({ kind: "archflow", title: "P-reserver" });
    const section = { title: "Contexte", markdown: "Texte." };
    const s = await pending("doc_section", section, "?");
    const accepted = await proposalApi(s.b.app, s.world.actors.dev).decide(
      s.world.projectId,
      s.id,
      "accept",
      { edited: section },
    );
    expect(accepted.body).toMatchObject({ kind: "doc_section", title: "Contexte" });
  });
});

describe("TK-114b (contrat 3.12.0, B620) : proposal.list rend le bilan du lancement de l'Architecture", () => {
  const COVERAGE = {
    features: { covered: 174, total: 174 },
    flows: { covered: 22, total: 22 },
    tables: { covered: 48, total: 48 },
  };
  const ZERO = {
    features: { covered: 0, total: 174 },
    flows: { covered: 0, total: 22 },
    tables: { covered: 0, total: 48 },
  };

  it("Architecture : report lu des colonnes du lancement ; Fonctionnel : aucun report", async () => {
    const { b, world } = await archScene();
    const scope = { organizationId: world.organizationId, projectId: world.projectId };
    const arch = await insertProposal(b.database, scope, {
      deliverable: "architecture",
      kind: "component",
      zone: "Noyau",
      title: "API",
      payload: COMPONENT,
    });
    await b.database.query(
      `UPDATE agent_launches SET zones = $2::jsonb, zones_done = 8, zones_discarded = 1,
         discard_reasons = '{"truncated": 1}'::jsonb, coverage_calls = 12, segment = 5,
         coverage_before = $3::jsonb, coverage_after = $4::jsonb, stop_reason = 'completed'
       WHERE id = $1`,
      [
        arch.launchId,
        JSON.stringify(Array.from({ length: 9 }, (_, i) => `Zone ${i}`)),
        JSON.stringify(ZERO),
        JSON.stringify(COVERAGE),
      ],
    );
    const api = proposalApi(b.app, world.actors.dev);
    const res = await api.list(world.projectId, { deliverable: "architecture" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.launch.report).toEqual({
      zonesRequested: 9,
      zonesDone: 8,
      zonesDiscarded: 1,
      discardReasons: [{ reason: "truncated", count: 1 }],
      coverageBefore: ZERO,
      coverageAfter: COVERAGE,
      coverageCalls: 12,
      stopReason: "completed",
    });
    await insertProposal(b.database, scope, { deliverable: "functional" });
    const functional = await api.list(world.projectId, { deliverable: "functional" });
    expect(functional.status).toBe(200);
    expect(functional.body.launch).not.toHaveProperty("report");
  });
});
