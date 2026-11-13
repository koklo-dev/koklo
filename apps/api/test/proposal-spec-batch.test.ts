import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FEATURE_CONTENT, insertProposal, proposalApi } from "./helpers/proposals.ts";
import {
  BRANCH,
  batch,
  batchApi,
  batchRows,
  createOp,
  fileOf,
  installSpecBench,
  specScene,
  submitOk,
} from "./helpers/spec-batch.ts";

/**
 * TK-99a (cas 5, 11) : `specBatch.submit` seul écrit dans la spec. `proposalIds` (facultatif, 200 au plus) : chaque
 * proposition doit être `accepted` et du projet, elle passe `appliedBatchId` à l'enfilage ; 200 opérations par lot
 * (le worker les commit en un commit), 201 refusées. Intégration : vrai worker, faux fournisseur git.
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });

const appliedOf = async (b: ReturnType<typeof bench>, id: string) =>
  (
    await b.database.query<{ applied_batch_id: string | null; status: string }>(
      "SELECT applied_batch_id, status FROM agent_proposals WHERE id = $1",
      [id],
    )
  )[0];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("specBatch.submit avec proposalIds (cas 5)", () => {
  it("rien n'entre dans la spec sans submit : décider n'écrit aucun lot ; submit pose appliedBatchId", async () => {
    const b = bench();
    const s = await specScene(b);
    const scope = { organizationId: s.world.organizationId, projectId: s.projectId };
    const { id } = await insertProposal(b.database, scope);
    const proposals = proposalApi(b.app, s.world.actors.dev);

    expect((await proposals.decide(s.projectId, id, "accept")).status).toBe(200);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(0);

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([createOp("Annuler une réservation")], { branch: BRANCH, proposalIds: [id] }),
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe("committed");
    expect(await appliedOf(b, id)).toEqual({ applied_batch_id: res.body.id, status: "accepted" });
    const again = await proposals.decide(s.projectId, id, "reset");
    expect(again.status).toBe(409);
  });

  it("une proposition non acceptée, inconnue ou d'un autre projet : 422 VALIDATION, aucun lot écrit", async () => {
    const b = bench();
    const s = await specScene(b);
    const scope = { organizationId: s.world.organizationId, projectId: s.projectId };
    const pending = await insertProposal(b.database, scope);
    const rejected = await insertProposal(b.database, scope, { status: "rejected" });
    const accepted = await insertProposal(b.database, scope, { status: "accepted" });
    const other = await specScene(b);
    const foreign = await insertProposal(
      b.database,
      { organizationId: other.world.organizationId, projectId: other.projectId },
      { status: "accepted" },
    );
    const api = batchApi(b.app, s.world.actors.dev);

    for (const proposalIds of [
      [pending.id],
      [rejected.id],
      [randomUUID()],
      [foreign.id],
      [accepted.id, pending.id],
    ]) {
      const res = await api.submit(
        s.projectId,
        batch([createOp("Rien")], { branch: BRANCH, proposalIds }),
      );
      expect(res.status, JSON.stringify(proposalIds)).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
    }
    expect(await batchRows(b.database, s.projectId)).toHaveLength(0);
    expect((await appliedOf(b, accepted.id))?.applied_batch_id).toBeNull();
  });

  it("une proposition déjà appliquée par un autre lot est refusée ; le rejeu du même lot reste idempotent", async () => {
    const b = bench();
    const s = await specScene(b);
    const scope = { organizationId: s.world.organizationId, projectId: s.projectId };
    const { id } = await insertProposal(b.database, scope, { status: "accepted" });
    const api = batchApi(b.app, s.world.actors.dev);
    const body = batch([createOp("Une seule fois")], { branch: BRANCH, proposalIds: [id] });

    const first = await api.submit(s.projectId, body);
    const replay = await api.submit(s.projectId, body);
    const second = await api.submit(
      s.projectId,
      batch([createOp("Encore")], { branch: BRANCH, proposalIds: [id] }),
    );

    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(second.status).toBe(422);
  });

  it("sans proposalIds : comportement inchangé ; au-delà de 200 identifiants : 400", async () => {
    const b = bench();
    const s = await specScene(b);
    const api = batchApi(b.app, s.world.actors.dev);
    const plain = await api.submit(
      s.projectId,
      batch([createOp("Sans proposition")], { branch: BRANCH }),
    );
    expect(plain.status, JSON.stringify(plain.body)).toBe(200);
    const tooMany = await api.submit(
      s.projectId,
      batch([createOp("Trop")], {
        branch: BRANCH,
        proposalIds: Array.from({ length: 201 }, () => randomUUID()),
      }),
    );
    expect(tooMany.status).toBe(400);
  });

  it("client et business : 403, même avec proposalIds", async () => {
    const b = bench();
    const s = await specScene(b);
    for (const role of ["client", "business"] as const) {
      const res = await batchApi(b.app, s.world.actors[role]).submit(
        s.projectId,
        batch([createOp("Non")], { branch: BRANCH, proposalIds: [randomUUID()] }),
      );
      expect(res.status, role).toBe(403);
    }
  });
});

describe("specBatch.submit : 200 opérations (cas 11)", () => {
  it("200 créations sont acceptées en un lot et commitées par le worker en un seul commit ; 201 refusées", async () => {
    const b = bench();
    const s = await specScene(b);
    const api = batchApi(b.app, s.world.actors.dev);
    // Le compteur de features démarre à F-001 : on le relève au-delà des deux features de départ (F-100, F-101).
    await b.database.query(
      `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
       VALUES ($1, $2, 'feature', 1000, now(), now())
       ON CONFLICT (project_id, name) DO UPDATE SET last_value = 1000`,
      [s.world.organizationId, s.projectId],
    );
    const operations = Array.from({ length: 200 }, (_, n) =>
      createOp(`Fonction ${n + 1}`, { description: FEATURE_CONTENT.description }),
    );

    const res = await api.submit(s.projectId, batch(operations, { branch: BRANCH }));

    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body.status).toBe("committed");
    expect(res.body.results).toHaveLength(200);
    expect(res.body.commitSha).toMatch(/^[0-9a-f]{40}$/);
    const refused = await api.submit(
      s.projectId,
      batch([...operations, createOp("De trop")], { branch: BRANCH }),
    );
    expect(refused.status).toBe(400);
  }, 180_000);
});

/**
 * TK-107 lot B (cas 12, B392) : accepter une table, des relations et un jeu d'exemple = UN lot (`table.create`,
 * `table.update`, `fixture.create`) dont chaque proposition passe `appliedBatchId` ; le serveur refuse un lot qui laisse
 * une référence pendante (la cascade du rejet est faite à l'écran, le serveur reste la garantie).
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("specBatch.submit avec des propositions de données (cas 12)", () => {
  const field = (name: string, type: string) => ({
    name,
    type,
    ...(name === "id" ? { primaryKey: true } : {}),
  });
  const salle = {
    kind: "table.create",
    name: "Salle",
    zone: "Réservations",
    fields: [field("id", "uuid")],
  };
  const reservation = {
    kind: "table.create",
    name: "Réservation",
    zone: "Réservations",
    fields: [field("id", "uuid"), field("salle_id", "ref(T-salle)")],
  };
  const relateTo = (target: string) => ({
    kind: "table.update",
    specId: "T-reservation",
    relations: [{ to: target, cardinality: "n → 1" }],
  });

  /** Quatre propositions de données acceptées ; la table `Réservation` existe déjà (une relation la met à jour). */
  async function accepted(b: ReturnType<typeof bench>, s: Awaited<ReturnType<typeof specScene>>) {
    await submitOk(b, s, [{ ...reservation, fields: [field("id", "uuid")] }]);
    const scope = { organizationId: s.world.organizationId, projectId: s.projectId };
    const ids: string[] = [];
    for (const [position, kind] of (["table", "relations", "fixtures"] as const).entries()) {
      const { id } = await insertProposal(b.database, scope, {
        deliverable: "data",
        kind,
        position,
        status: "accepted",
        title: kind,
        payload: {},
      });
      ids.push(id);
    }
    return ids;
  }

  it("une table, des relations et un jeu : un seul lot committed, chaque proposition appliquée", async () => {
    const b = bench();
    const s = await specScene(b);
    const proposalIds = await accepted(b, s);
    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch(
        [
          salle,
          relateTo("T-salle"),
          {
            kind: "fixture.create",
            title: "Salles de démo",
            table: "T-salle",
            rows: [{ id: "s-1" }],
          },
        ],
        { branch: BRANCH, proposalIds },
      ),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe("committed");
    expect(res.body.results.map((r: { kind: string }) => r.kind)).toEqual([
      "table.create",
      "table.update",
      "fixture.create",
    ]);
    for (const id of proposalIds)
      expect((await appliedOf(b, id))?.applied_batch_id).toBe(res.body.id);
    expect((await fileOf(b, s, "data/tables/reservation.yaml")).content).toContain("T-salle");
  });

  it("une relation vers une table absente du lot et de la spec (table rejetée) : SPEC_INVALID, aucune relation écrite", async () => {
    const b = bench();
    const s = await specScene(b);
    const proposalIds = await accepted(b, s);
    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([relateTo("T-salle")], { branch: BRANCH, proposalIds }),
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("SPEC_INVALID");
    expect(
      (await batchRows(b.database, s.projectId)).filter((row) => row.status === "committed"),
    ).toHaveLength(1);
    expect((await fileOf(b, s, "data/tables/reservation.yaml")).content).not.toContain("T-salle");
  });
});
