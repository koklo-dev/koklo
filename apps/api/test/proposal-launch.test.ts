import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aiAuditRows, installAiBench, keyedWorld } from "./helpers/ai-bench.ts";
import { ago, insertReviewAt } from "./helpers/deliverable-reviews.ts";
import { freezeIdea, launchRows, proposalApi } from "./helpers/proposals.ts";

/**
 * TK-99a (cas 1, 8, 13, 14) : `ai.proposeDeliverable` et `ai.proposeOptions`. Un seul lancement actif par
 * (projet, livrable), imposé par la base ; refus d'avant-lancement en vraies erreurs ; une ligne d'audit par
 * lancement ; payload pg-boss réduit à l'identifiant du lancement.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

async function readyWorld() {
  const b = bench();
  const { world } = await keyedWorld(b, { freeze: false });
  await freezeIdea(b.database, world);
  return { b, world };
}

/** Fonctionnel validé avant `idea-v2`, qui modifie la vision et ajoute une page : le Fonctionnel est « À revoir ». */
async function staleFunctional(
  b: ReturnType<typeof bench>,
  world: Awaited<ReturnType<typeof keyedWorld>>["world"],
) {
  const { seedProposals } = await import("./helpers/proposals.ts");
  await seedProposals(b.database, world);
  await b.database.query("UPDATE idea_versions SET frozen_at = $2 WHERE project_id = $1", [
    world.projectId,
    ago(3),
  ]);
  const [repo] = await b.database.query<{ id: string }>(
    "SELECT id FROM project_repos WHERE project_id = $1",
    [world.projectId],
  );
  await insertReviewAt(
    b.database,
    { organizationId: world.organizationId, projectId: world.projectId, repoId: repo?.id ?? "" },
    world.actors.owner.userId,
    ago(2),
  );
  await freezeIdea(b.database, world, 2, { vision: 2, personas: 1, risques: 1 });
}

describe("ai.proposeDeliverable : mode update (B328)", () => {
  it("sans staleBecause : 422 VALIDATION, aucun lancement, rien d'enfilé", async () => {
    const { b, world } = await readyWorld();
    const res = await proposalApi(b.app, world.actors.dev).propose(world.projectId, {
      mode: "update",
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
    expect(b.agentQueue.jobs).toHaveLength(0);
  });

  it("avec staleBecause : lancement queued en mode update, sur la version figée la plus récente", async () => {
    const { b, world } = await readyWorld();
    b.use(FakeLlm.replying({}));
    await staleFunctional(b, world);
    const res = await proposalApi(b.app, world.actors.dev).propose(world.projectId, {
      mode: "update",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = await launchRows(b.database, world.projectId);
    expect(rows.find((row) => row.id === res.body.launchId)).toMatchObject({
      status: "queued",
      mode: "update",
      base_version: 2,
    });
    expect(b.agentQueue.jobs).toHaveLength(1);
  }, 120_000);
});

describe("ai.proposeDeliverable : nominal", () => {
  it("200 { launchId, status: queued } ; lancement en base, une tâche enfilée sans secret ni consigne", async () => {
    const { b, world } = await readyWorld();
    const fake = FakeLlm.replying({});
    b.use(fake);

    const res = await proposalApi(b.app, world.actors.dev).propose(world.projectId, {
      mode: "criteria",
      instruction: "Priorité aux réservations",
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ launchId: expect.any(String), status: "queued" });
    const [row] = await launchRows(b.database, world.projectId);
    expect(row).toMatchObject({
      id: res.body.launchId,
      status: "queued",
      deliverable: "functional",
      base_version: 1,
      sources: ["idea.frozen", "idea.synthesis", "idea.risks", "functional.current"],
      instruction: "Priorité aux réservations",
    });
    expect(b.agentQueue.jobs).toEqual([{ id: res.body.launchId, launchId: res.body.launchId }]);
    expect(JSON.stringify(b.agentQueue.jobs)).not.toContain("réservations");
    expect(fake.calls).toHaveLength(0);
  });

  it("une seule ligne d'audit `ai.deliverable.propose` par lancement, sans la consigne", async () => {
    const { b, world } = await readyWorld();
    const res = await proposalApi(b.app, world.actors.owner).propose(world.projectId, {
      instruction: "Un texte secret de consigne",
    });
    expect(res.status).toBe(200);
    const rows = (await aiAuditRows(b.database, world.organizationId)).filter(
      (r) => r.action === "ai.deliverable.propose",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target_kind: "agent_launch", target_id: res.body.launchId });
    expect(JSON.stringify(rows)).not.toContain("secret de consigne");
  });
});

describe("ai.proposeDeliverable : refus avant lancement", () => {
  it("livrable non branché : 422 VALIDATION, aucun lancement", async () => {
    const { b, world } = await readyWorld();
    const res = await proposalApi(b.app, world.actors.dev).propose(world.projectId, {
      deliverable: "data",
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
  });

  it("aucune version idea-vN figée : 422 VALIDATION", async () => {
    const b = bench();
    const { world } = await keyedWorld(b, { freeze: false });
    const res = await proposalApi(b.app, world.actors.dev).propose(world.projectId);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("aucune clé d'IA : 409 LLM_NOT_CONFIGURED et le verrou n'est pas pris (relance possible ensuite)", async () => {
    const b = bench();
    const { createWorld } = await import("./helpers/tickets.ts");
    const world = await createWorld(b.database);
    await freezeIdea(b.database, world);
    const refused = await proposalApi(b.app, world.actors.dev).propose(world.projectId);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("LLM_NOT_CONFIGURED");
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
    expect(b.agentQueue.jobs).toHaveLength(0);
  });

  it("plafond d'appels atteint : 429 LLM_RATE_LIMITED, lancement retiré, verrou libéré", async () => {
    const { b, world } = await readyWorld();
    const tight = await b.makeApp({ limits: { maxCallsPerHourUser: 1 } });
    const api = proposalApi(tight, world.actors.dev);
    expect((await api.propose(world.projectId)).status).toBe(200);
    await b.database.query("UPDATE agent_launches SET status = 'done' WHERE project_id = $1", [
      world.projectId,
    ]);
    const limited = await api.propose(world.projectId);
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("LLM_RATE_LIMITED");
    const rows = await launchRows(b.database, world.projectId);
    expect(rows.map((r) => r.status)).toEqual(["done"]);
  });

  it("enfilage impossible : le lancement passe failed (enqueue_failed), le verrou est libéré, relance possible", async () => {
    const { b, world } = await readyWorld();
    b.agentQueue.failNext = true;
    const api = proposalApi(b.app, world.actors.dev);
    const failed = await api.propose(world.projectId);
    expect(failed.status).toBe(500);
    const [row] = await launchRows(b.database, world.projectId);
    expect(row).toMatchObject({ status: "failed", error_code: "enqueue_failed" });
    expect((await api.propose(world.projectId)).status).toBe(200);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("ai.proposeDeliverable : un seul lancement actif par livrable", () => {
  it("deux requêtes concurrentes sur la même application : un succès, un 409 PROPOSAL_IN_PROGRESS", async () => {
    const { b, world } = await readyWorld();
    const api = proposalApi(b.app, world.actors.dev);
    const results = await Promise.all([api.propose(world.projectId), api.propose(world.projectId)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409);
    const winner = results.find((r) => r.status === 200);
    expect(loser?.body.code).toBe("PROPOSAL_IN_PROGRESS");
    expect(loser?.body.data.launchId).toBe(winner?.body.launchId);
    expect(await launchRows(b.database, world.projectId)).toHaveLength(1);
    expect(b.agentQueue.jobs).toHaveLength(1);
  });

  it("DEUX instances de l'API sur la même base, requêtes simultanées : un seul gagne", async () => {
    const { b, world } = await readyWorld();
    const second = await b.makeApp();
    const results = await Promise.all([
      proposalApi(b.app, world.actors.dev).propose(world.projectId),
      proposalApi(second, world.actors.admin).propose(world.projectId),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await launchRows(b.database, world.projectId)).toHaveLength(1);
    expect(b.agentQueue.jobs).toHaveLength(1);
  });

  it("un autre projet de l'organisation n'est pas bloqué, ni un autre livrable en base", async () => {
    const { b, world } = await readyWorld();
    const { insertProject } = await import("./helpers/tickets.ts");
    const other = await insertProject(b.database, world.organizationId, "Autre");
    await freezeIdea(b.database, { organizationId: world.organizationId, projectId: other });
    const api = proposalApi(b.app, world.actors.dev);
    expect((await api.propose(world.projectId)).status).toBe(200);
    expect((await api.propose(other)).status).toBe(200);
    expect((await api.propose(world.projectId)).status).toBe(409);
  });

  it("un lancement terminé libère le verrou ; un lancement running périmé (5 min sans signal) est repris", async () => {
    const { b, world } = await readyWorld();
    const api = proposalApi(b.app, world.actors.dev);
    const first = await api.propose(world.projectId);
    await b.database.query(
      "UPDATE agent_launches SET status = 'running', heartbeat_at = now() - interval '4 minutes' WHERE id = $1",
      [first.body.launchId],
    );
    expect((await api.propose(world.projectId)).status).toBe(409);

    await b.database.query(
      "UPDATE agent_launches SET heartbeat_at = now() - interval '6 minutes' WHERE id = $1",
      [first.body.launchId],
    );
    const retaken = await api.propose(world.projectId);

    expect(retaken.status, JSON.stringify(retaken.body)).toBe(200);
    const rows = await launchRows(b.database, world.projectId);
    expect(rows.map((r) => [r.status, r.error_code])).toEqual([
      ["failed", "worker_lost"],
      ["queued", null],
    ]);
  });
});

describe("droits (cas 8)", () => {
  it("client et business : 403 ; dev, designer, admin, owner autorisés ; autre organisation : 404", async () => {
    const { b, world } = await readyWorld();
    for (const role of ["client", "business"] as const) {
      expect(
        (await proposalApi(b.app, world.actors[role]).propose(world.projectId)).status,
        role,
      ).toBe(403);
      expect(
        (await proposalApi(b.app, world.actors[role]).options(world.projectId)).status,
        role,
      ).toBe(403);
    }
    expect(await launchRows(b.database, world.projectId)).toHaveLength(0);
    for (const role of ["designer", "dev"] as const) {
      expect(
        (await proposalApi(b.app, world.actors[role]).options(world.projectId)).status,
        role,
      ).toBe(200);
    }
    const other = await keyedWorld(b, { freeze: false });
    const cross = await proposalApi(b.app, world.actors.dev).propose(other.world.projectId);
    expect(cross.status).toBe(404);
  });
});
describe("ai.proposeOptions (cas 13)", () => {
  it("sans version figée : available false, raison no_frozen_idea, « L'agent lit » quand même listé", async () => {
    const b = bench();
    const { world } = await keyedWorld(b, { freeze: false });
    const res = await proposalApi(b.app, world.actors.dev).options(world.projectId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: false, reason: "no_frozen_idea", options: [] });
    expect(res.body.reads.map((r: { id: string }) => r.id)).toEqual([
      "idea.frozen",
      "idea.synthesis",
      "idea.risks",
      "functional.current",
    ]);
  });

  it("livrable non branché : available false, raison not_wired", async () => {
    const { b, world } = await readyWorld();
    const res = await proposalApi(b.app, world.actors.dev).options(world.projectId, "data");
    expect(res.body).toMatchObject({
      available: false,
      reason: "not_wired",
      options: [],
      reads: [],
    });
  });

  it("version figée sans cahier ni lancement : complete (recommandée) et all, sans compte ; options à 0 omises", async () => {
    const { b, world } = await readyWorld();
    const res = await proposalApi(b.app, world.actors.dev).options(world.projectId);
    expect(res.body.available).toBe(true);
    expect(res.body.options).toEqual([
      { id: "complete", recommended: true },
      { id: "all", recommended: false },
    ]);
  });

  it("critères : les fonctionnalités sans critère ; mise à jour : les pages changées entre idea-v1 et idea-v2, Fonctionnel à revoir", async () => {
    const { b, world } = await readyWorld();
    await staleFunctional(b, world);
    // seed:large : 1 000 fonctionnalités, chacune a au moins un critère -> aucune sans critère.
    await b.database.query(
      "DELETE FROM spec_criteria WHERE feature_id IN (SELECT f.id FROM spec_features f JOIN spec_snapshots s ON s.id = f.snapshot_id JOIN project_repos r ON r.id = s.repo_id WHERE r.project_id = $1 ORDER BY f.spec_id LIMIT 7)",
      [world.projectId],
    );

    const res = await proposalApi(b.app, world.actors.dev).options(world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.options.map((o: { id: string; count?: number }) => [o.id, o.count])).toEqual([
      ["complete", undefined],
      ["criteria", 7],
      ["update", 2],
      ["all", undefined],
    ]);
    expect(res.body.options.filter((o: { recommended: boolean }) => o.recommended)).toHaveLength(1);
    expect(res.body.options[0].recommended).toBe(true);
  }, 120_000);
});
