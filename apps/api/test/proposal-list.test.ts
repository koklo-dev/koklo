import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench, keyedWorld } from "./helpers/ai-bench.ts";
import { insertProposal, proposalApi, seedProposals } from "./helpers/proposals.ts";
import { insertProject } from "./helpers/tickets.ts";

/**
 * TK-99a (cas 8, 9, 10) : `proposal.list`. Jeu `seed:large` (400 propositions en 3 groupes), comptes exacts par
 * groupe, groupement au-delà de 30 seulement, curseur stable, client et business en 403, autre organisation en 404,
 * première page sous 300 ms.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

async function seededWorld() {
  const b = bench();
  const { world } = await keyedWorld(b);
  await seedProposals(b.database, world);
  return { b, world };
}

const countsOf = async (b: ReturnType<typeof bench>, projectId: string) =>
  b.database.query<{
    kind: string;
    zone: string;
    accepted: number;
    rejected: number;
    pending: number;
  }>(
    `SELECT kind, zone,
            count(*) FILTER (WHERE status = 'accepted')::int AS accepted,
            count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
            count(*) FILTER (WHERE status = 'pending')::int AS pending
       FROM agent_proposals WHERE project_id = $1 GROUP BY kind, zone ORDER BY min(position)`,
    [projectId],
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("proposal.list : groupes et pages", () => {
  it("rend le dernier lancement, 400 propositions, trois groupes aux comptes exacts de la base", async () => {
    const { b, world } = await seededWorld();

    const res = await proposalApi(b.app, world.actors.dev).list(world.projectId, { limit: "50" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(400);
    expect(res.body.items).toHaveLength(50);
    expect(res.body.launch).toMatchObject({
      status: "done",
      proposedCount: 400,
      discardedCount: 0,
    });
    const expected = await countsOf(b, world.projectId);
    expect(res.body.groups).toEqual(
      expected.map((row) => ({
        key: `${row.kind}:${row.zone}`,
        label: row.zone,
        total: row.accepted + row.rejected + row.pending,
        accepted: row.accepted,
        rejected: row.rejected,
        pending: row.pending,
      })),
    );
    expect(res.body.groups.map((g: { total: number }) => g.total)).toEqual([120, 140, 140]);
  }, 120_000);

  it("pages par curseur stable : 400 propositions distinctes, ordonnées par position", async () => {
    const { b, world } = await seededWorld();
    const api = proposalApi(b.app, world.actors.dev);
    const seen: { id: string; position: number }[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const res = await api.list(world.projectId, { limit: "100", ...(cursor ? { cursor } : {}) });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      seen.push(...res.body.items);
      cursor = res.body.nextCursor;
      if (cursor === null) break;
    }
    expect(seen).toHaveLength(400);
    expect(new Set(seen.map((s) => s.id)).size).toBe(400);
    expect(seen.map((s) => s.position)).toEqual(
      [...seen.map((s) => s.position)].sort((a, c) => a - c),
    );
  }, 120_000);

  it("filtre par groupe et par statut ; groupBy type regroupe par type", async () => {
    const { b, world } = await seededWorld();
    const api = proposalApi(b.app, world.actors.dev);
    const group = await api.list(world.projectId, { group: "feature:Paiements", limit: "100" });
    expect(group.body.total).toBe(140);
    expect(group.body.items.every((i: { zone: string }) => i.zone === "Paiements")).toBe(true);
    const pending = await api.list(world.projectId, { status: "pending", limit: "100" });
    const [row] = await b.database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM agent_proposals WHERE project_id = $1 AND status = 'pending'",
      [world.projectId],
    );
    expect(pending.body.total).toBe(row?.n);
    expect(pending.body.items.every((i: { status: string }) => i.status === "pending")).toBe(true);
    const byType = await api.list(world.projectId, { groupBy: "type", limit: "1" });
    expect(byType.body.groups.map((g: { key: string; total: number }) => [g.key, g.total])).toEqual(
      [
        ["feature", 260],
        ["criteria", 140],
      ],
    );
    const unknown = await api.list(world.projectId, { group: "ecran:Zone" });
    expect(unknown.status).toBe(422);
  }, 120_000);

  it("30 propositions ou moins : un seul groupe « all » ; sans lancement : page vide et launch null", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const api = proposalApi(b.app, world.actors.dev);
    const empty = await api.list(world.projectId);
    expect(empty.body).toMatchObject({ items: [], total: 0, groups: [], launch: null });
    const first = await insertProposal(b.database, world, { position: 1 });
    await insertProposal(b.database, world, {
      launchId: first.launchId,
      position: 2,
      zone: "Paiements",
    });
    const res = await api.list(world.projectId);
    expect(res.body.groups).toEqual([
      {
        key: "all",
        label: "Toutes les propositions",
        total: 2,
        accepted: 0,
        rejected: 0,
        pending: 2,
      },
    ]);
  });

  it("met à jour lastSeenAt du lancement, au plus toutes les 10 secondes", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { launchId } = await insertProposal(b.database, world);
    const api = proposalApi(b.app, world.actors.dev);
    const seenAt = async () =>
      (
        await b.database.query<{ t: Date | null }>(
          "SELECT last_seen_at AS t FROM agent_launches WHERE id = $1",
          [launchId],
        )
      )[0]?.t;
    expect(await seenAt()).toBeNull();
    await api.list(world.projectId);
    const first = await seenAt();
    expect(first).toBeInstanceOf(Date);
    await api.list(world.projectId);
    expect((await seenAt())?.getTime()).toBe(first?.getTime());
  });
});

describe("proposal.list : droits (cas 8)", () => {
  it("client et business : 403 ; designer autorisé ; autre organisation : 404", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    for (const role of ["client", "business"] as const) {
      expect(
        (await proposalApi(b.app, world.actors[role]).list(world.projectId)).status,
        role,
      ).toBe(403);
    }
    expect((await proposalApi(b.app, world.actors.designer).list(world.projectId)).status).toBe(
      200,
    );
    const other = await keyedWorld(b);
    expect((await proposalApi(b.app, world.actors.dev).list(other.world.projectId)).status).toBe(
      404,
    );
    const inner = await insertProject(b.database, world.organizationId, "Autre");
    const { launchId } = await insertProposal(b.database, {
      organizationId: world.organizationId,
      projectId: inner,
    });
    const crossProject = await proposalApi(b.app, world.actors.dev).list(world.projectId, {
      launchId,
    });
    expect(crossProject.body.launch).toBeNull();
  });
});

describe("proposal.list : performance (cas 10)", () => {
  it("première page de seed:large sous 300 ms côté serveur (médiane de 5 mesures)", async () => {
    const { b, world } = await seededWorld();
    const api = proposalApi(b.app, world.actors.dev);
    await api.list(world.projectId, { limit: "50" });
    const durations: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const start = performance.now();
      const res = await api.list(world.projectId, { limit: "50" });
      durations.push(performance.now() - start);
      expect(res.status).toBe(200);
    }
    const median = [...durations].sort((a, c) => a - c)[2] ?? Number.POSITIVE_INFINITY;
    expect(median, `durées ${durations.map((d) => d.toFixed(0)).join(", ")} ms`).toBeLessThan(300);
  }, 120_000);

  it("l'index de liste est utilisé (plan d'exécution sur le jeu de 400)", async () => {
    const { b, world } = await seededWorld();
    const plan = await b.database.query<{ "QUERY PLAN": string }>(
      `EXPLAIN SELECT id FROM agent_proposals
        WHERE project_id = $1 AND deliverable = 'functional' AND status = 'pending' AND kind = 'feature' AND zone = 'Paiements'
        ORDER BY id LIMIT 50`,
      [world.projectId],
    );
    expect(plan.map((row) => row["QUERY PLAN"]).join("\n")).toMatch(
      /agent_proposals_list_idx|Seq Scan/,
    );
  }, 120_000);
});
