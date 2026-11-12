import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench, keyedWorld } from "./helpers/ai-bench.ts";
import { auditRowsFull } from "./helpers/comments.ts";
import {
  FEATURE_CONTENT,
  insertProposal,
  proposalApi,
  seedProposals,
} from "./helpers/proposals.ts";

/**
 * TK-99a (cas 5, 6, 8, 9) : `proposal.decide` et `proposal.decideMany`. Décider n'écrit JAMAIS dans la spec ; une
 * proposition appliquée n'est plus modifiable ; `decideMany` agit sur TOUTES les `pending` du groupe (chargées ou
 * non) et refuse un N périmé ; le contenu corrigé est un texte brut.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

const decisionRows = (b: ReturnType<typeof bench>, proposalId: string) =>
  b.database.query<{ decision: string; edited: boolean }>(
    "SELECT decision, edited FROM agent_proposal_decisions WHERE proposal_id = $1 ORDER BY decided_at, id",
    [proposalId],
  );
const statusOf = async (b: ReturnType<typeof bench>, id: string) =>
  (
    await b.database.query<{ status: string }>("SELECT status FROM agent_proposals WHERE id = $1", [
      id,
    ])
  )[0]?.status;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("proposal.decide", () => {
  it("accept, reject, reset : l'état suit, le journal garde chaque décision, aucun lot de spec n'est écrit", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { id } = await insertProposal(b.database, world);
    const api = proposalApi(b.app, world.actors.dev);

    for (const [decision, status] of [
      ["accept", "accepted"],
      ["reject", "rejected"],
      ["reset", "pending"],
    ] as const) {
      const res = await api.decide(world.projectId, id, decision);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ id, status, appliedBatchId: null });
    }

    expect((await decisionRows(b, id)).map((r) => r.decision)).toEqual([
      "accept",
      "reject",
      "reset",
    ]);
    const [batches] = await b.database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM spec_write_batches WHERE project_id = $1",
      [world.projectId],
    );
    expect(batches?.n).toBe(0);
    expect(b.queue.enqueued).toEqual([]);
  });

  it("une ligne d'audit proposal.decide par décision, visant la proposition", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { id } = await insertProposal(b.database, world);
    await proposalApi(b.app, world.actors.owner).decide(world.projectId, id, "accept");
    const rows = (await auditRowsFull(b.database, world.organizationId)).filter(
      (r) => r.action === "proposal.decide",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target_kind: "agent_proposal", target_id: id });
  });

  it("contenu corrigé : revalidé, titre mis à jour, journal `edited` ; texte avec lien ou balise refusé (422)", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { id } = await insertProposal(b.database, world);
    const api = proposalApi(b.app, world.actors.dev);

    const ok = await api.decide(world.projectId, id, "accept", {
      edited: { ...FEATURE_CONTENT, title: "Annuler en un geste" },
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ title: "Annuler en un geste", status: "accepted" });
    expect((await decisionRows(b, id)).at(-1)).toEqual({ decision: "accept", edited: true });

    for (const bad of [
      { ...FEATURE_CONTENT, title: "Voir https://exemple.fr" },
      { ...FEATURE_CONTENT, description: "<script>x</script>" },
      { ...FEATURE_CONTENT, description: "[lien](http://x.fr)" },
      { ...FEATURE_CONTENT, description: "ok‮cache" },
      { titre: "mauvaise forme" },
    ]) {
      const res = await api.decide(world.projectId, id, "accept", { edited: bad });
      expect(res.status, JSON.stringify(bad)).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
    }
    expect(
      (await api.decide(world.projectId, id, "reject", { edited: FEATURE_CONTENT })).status,
    ).toBe(422);
  });

  it("une proposition appliquée par un lot n'est jamais modifiable : 409 CONFLICT, état inchangé", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { id } = await insertProposal(b.database, world, { status: "accepted" });
    await b.database.query("UPDATE agent_proposals SET applied_batch_id = $2 WHERE id = $1", [
      id,
      randomUUID(),
    ]);
    const res = await proposalApi(b.app, world.actors.dev).decide(world.projectId, id, "reject");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
    expect(await statusOf(b, id)).toBe("accepted");
  });

  it("client et business : 403 ; proposition d'un autre projet ou inconnue : 404", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { id } = await insertProposal(b.database, world);
    for (const role of ["client", "business"] as const) {
      expect(
        (await proposalApi(b.app, world.actors[role]).decide(world.projectId, id, "accept")).status,
        role,
      ).toBe(403);
    }
    const other = await keyedWorld(b);
    expect(
      (await proposalApi(b.app, other.world.actors.dev).decide(other.world.projectId, id, "accept"))
        .status,
    ).toBe(404);
    expect(
      (await proposalApi(b.app, world.actors.dev).decide(world.projectId, randomUUID(), "accept"))
        .status,
    ).toBe(404);
    expect(await statusOf(b, id)).toBe("pending");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("proposal.decideMany (cas 9)", () => {
  async function seeded() {
    const b = bench();
    const { world } = await keyedWorld(b);
    await seedProposals(b.database, world);
    const [launch] = await b.database.query<{ id: string }>(
      "SELECT id FROM agent_launches WHERE project_id = $1",
      [world.projectId],
    );
    const pendingIn = async (zone: string) =>
      (
        await b.database.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM agent_proposals WHERE project_id = $1 AND zone = $2 AND status = 'pending'",
          [world.projectId, zone],
        )
      )[0]?.n ?? 0;
    return { b, world, launchId: launch?.id ?? "", pendingIn };
  }

  it("un groupe de 120 dont 8 chargées : décide toutes les en attente du groupe et aucune autre", async () => {
    const { b, world, launchId, pendingIn } = await seeded();
    const api = proposalApi(b.app, world.actors.dev);
    const loaded = await api.list(world.projectId, {
      group: "feature:Réservations",
      status: "pending",
      limit: "8",
    });
    expect(loaded.body.items).toHaveLength(8);
    const pending = await pendingIn("Réservations");
    expect(pending).toBeGreaterThan(8);
    const paiementsBefore = await pendingIn("Paiements");

    const res = await api.decideMany(world.projectId, {
      launchId,
      group: "feature:Réservations",
      expectedPending: pending,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ decided: pending });
    expect(await pendingIn("Réservations")).toBe(0);
    expect(await pendingIn("Paiements")).toBe(paiementsBefore);
    const rows = await auditRowsFull(b.database, world.organizationId);
    expect(rows.filter((r) => r.action === "proposal.decideMany")).toHaveLength(1);
    const [journal] = await b.database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM agent_proposal_decisions WHERE organization_id = $1",
      [world.organizationId],
    );
    expect(journal?.n).toBe(pending);
  }, 120_000);

  it("expectedPending faux : 409 PROPOSAL_COUNT_CHANGED avec le N réel, rien n'est décidé", async () => {
    const { b, world, launchId, pendingIn } = await seeded();
    const pending = await pendingIn("Paiements");
    const res = await proposalApi(b.app, world.actors.dev).decideMany(world.projectId, {
      launchId,
      group: "feature:Paiements",
      expectedPending: pending + 1,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PROPOSAL_COUNT_CHANGED");
    expect(res.body.data).toEqual({ expected: pending + 1, actual: pending });
    expect(await pendingIn("Paiements")).toBe(pending);
  }, 120_000);

  it("« all » refusé sur un lancement groupé, groupe inconnu refusé, lancement d'un autre projet : 404", async () => {
    const { b, world, launchId } = await seeded();
    const api = proposalApi(b.app, world.actors.dev);
    expect(
      (await api.decideMany(world.projectId, { launchId, group: "all", expectedPending: 0 }))
        .status,
    ).toBe(422);
    expect(
      (await api.decideMany(world.projectId, { launchId, group: "ecran:X", expectedPending: 0 }))
        .status,
    ).toBe(422);
    const other = await keyedWorld(b);
    const cross = await proposalApi(b.app, other.world.actors.dev).decideMany(
      other.world.projectId,
      { launchId, group: "feature:Paiements", expectedPending: 0 },
    );
    expect(cross.status).toBe(404);
  }, 120_000);

  it("concurrent avec un decide : comptes cohérents, journal égal au nombre de changements réels", async () => {
    const { b, world, launchId, pendingIn } = await seeded();
    const api = proposalApi(b.app, world.actors.dev);
    const pending = await pendingIn("Facturation");
    const target = await api.list(world.projectId, {
      group: "criteria:Facturation",
      status: "pending",
      limit: "1",
    });
    const targetId = target.body.items[0].id as string;

    const [many, one] = await Promise.all([
      api.decideMany(world.projectId, {
        launchId,
        group: "criteria:Facturation",
        expectedPending: pending,
      }),
      api.decide(world.projectId, targetId, "reject"),
    ]);

    expect(one.status).toBe(200);
    expect([200, 409]).toContain(many.status);
    const left = await pendingIn("Facturation");
    if (many.status === 200) {
      expect(left).toBe(0);
      expect(many.body.decided).toBe(pending);
    } else {
      expect(many.body.code).toBe("PROPOSAL_COUNT_CHANGED");
      expect(left).toBe(pending - 1);
    }
    expect(await statusOf(b, targetId)).toMatch(/rejected|accepted/);
  }, 120_000);

  it("client et business : 403", async () => {
    const { b, world, launchId } = await seeded();
    for (const role of ["client", "business"] as const) {
      const res = await proposalApi(b.app, world.actors[role]).decideMany(world.projectId, {
        launchId,
        group: "feature:Paiements",
        expectedPending: 1,
      });
      expect(res.status, role).toBe(403);
    }
  }, 120_000);
});
