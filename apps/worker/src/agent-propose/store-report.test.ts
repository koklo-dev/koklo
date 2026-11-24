import { describe, expect, it } from "vitest";
import { LAUNCH } from "../../test/support/propose-run.ts";
import {
  claimSegment,
  launchProposalsIn,
  mergeLinks,
  publishCoverageIn,
  publishZoneIn,
} from "./store-report.ts";

/**
 * TK-114b (B617-B621) : écritures du bilan, sur un faux client Prisma qui enregistre les filtres `where` et les données.
 * Les cas de prise d'un job de suite (double livraison) et les motifs fermés sont vérifiés ici ; le SQL réel est couvert
 * par `test/agent-propose.integration.test.ts`.
 */
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const matches = (row: Row, where: Where) =>
  Object.entries(where).every(([key, value]) => {
    if (value !== null && typeof value === "object" && "not" in value) return row[key] !== null;
    return row[key] === value;
  });

/** Faux `Writer` : un lancement, ses propositions, les appels reçus. */
function writerOf(launch: Row, proposals: Row[] = []) {
  const calls: { op: string; where?: Where; data?: unknown }[] = [];
  const client = {
    agentLaunch: {
      findFirst: async ({ where }: { where: Where }) => (matches(launch, where) ? launch : null),
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        calls.push({ op: "launch.updateMany", where, data });
        if (!matches(launch, where)) return { count: 0 };
        Object.assign(launch, data);
        return { count: 1 };
      },
    },
    agentProposal: {
      createMany: async ({ data }: { data: Row[] }) => {
        calls.push({ op: "proposal.createMany", data });
        proposals.push(...data);
        return { count: data.length };
      },
      findFirst: async ({ where }: { where: Where }) =>
        proposals.find((row) => matches(row, where)) ?? null,
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        calls.push({ op: "proposal.updateMany", where, data });
        const hit = proposals.filter((row) => matches(row, where));
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      },
      findMany: async () => proposals,
    },
  };
  return { client: client as never, calls, launch, proposals };
}

const NOW = new Date("2026-11-21T10:00:00Z");
const progressRow = {
  segment: 2,
  zones: ["Achats", 3],
  zonesDone: 1,
  zonesDiscarded: 1,
  coverageCalls: 4,
  coverageStalled: 1,
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("store-report (TK-114b)", () => {
  it("claimSegment : relais posé → ready avec la progression, relais consommé", async () => {
    const fake = writerOf({ id: LAUNCH.id, status: "running", segment: 2, handoffAt: NOW });
    const row = { ...progressRow, status: "running", handoffAt: NOW };
    const claim = await claimSegment(fake.client, row, LAUNCH, 2, NOW);
    expect(claim).toEqual({
      kind: "ready",
      launch: LAUNCH,
      progress: { ...progressRow, zones: ["Achats"] },
    });
    expect(fake.launch).toMatchObject({ handoffAt: null, heartbeatAt: NOW });
    expect(fake.calls[0]?.where).toEqual({
      id: LAUNCH.id,
      status: "running",
      segment: 2,
      handoffAt: { not: null },
    });
  });

  it("claimSegment : double livraison, autre segment ou lancement fini → settled ; relais absent → lost", async () => {
    const taken = writerOf({ id: LAUNCH.id, status: "running", segment: 2, handoffAt: null });
    const row = { ...progressRow, status: "running", handoffAt: NOW };
    expect(await claimSegment(taken.client, row, LAUNCH, 2, NOW)).toEqual({ kind: "settled" });
    const other = writerOf({});
    expect(await claimSegment(other.client, row, LAUNCH, 1, NOW)).toEqual({ kind: "settled" });
    const done = { ...row, status: "done" };
    expect(await claimSegment(other.client, done, LAUNCH, 2, NOW)).toEqual({ kind: "settled" });
    const noRelay = { ...row, handoffAt: null };
    expect(await claimSegment(other.client, noRelay, LAUNCH, 2, NOW)).toEqual({
      kind: "lost",
      launch: LAUNCH,
    });
    expect(other.calls).toEqual([]);
  });

  it("TK-114d (B653) : mergeLinks réunit les rôles, 20 au plus ; sans rôle ajouté, actors inchangé", () => {
    const actors = Array.from({ length: 19 }, (_, i) => `RL-r${i}`);
    const merged = mergeLinks(
      { name: "Web", actors },
      { owns: [], serves: [], actors: ["RL-r0", "RL-neuf", "RL-de-trop"] },
    );
    expect(merged.actors).toEqual([...actors, "RL-neuf"]);
    expect(mergeLinks({ actors: ["RL-a"] }, { owns: [], serves: [] }).actors).toEqual(["RL-a"]);
  });

  it("mergeLinks : union sans doublon, 200 liens au plus, liste sans ajout inchangée", () => {
    const owns = Array.from({ length: 199 }, (_, i) => `T-${i}`);
    const merged = mergeLinks(
      { name: "Base", owns, serves: "pas une liste" },
      { owns: ["T-0", "T-neuve", "T-de-trop"], serves: [] },
    );
    expect(merged.owns).toHaveLength(200);
    expect((merged.owns as string[]).at(-1)).toBe("T-neuve");
    expect(merged.serves).toBe("pas une liste");
    expect(mergeLinks({ serves: ["F-1"] }, { owns: [], serves: ["F-1", "F-2"] })).toEqual({
      serves: ["F-1", "F-2"],
    });
  });

  it("TK-114c (B636) : mergeLinks réunit dependsOn par cible, 30 au plus ; sans ajout, inchangé", () => {
    const deps = Array.from({ length: 29 }, (_, i) => ({ to: `C-c${i}`, via: "HTTP" }));
    const merged = mergeLinks(
      { name: "Api", dependsOn: deps },
      {
        owns: [],
        serves: [],
        dependsOn: [
          { to: "C-c0", via: "TCP" },
          { to: "C-neuf", via: "AMQP", async: true },
          { to: "C-de-trop", via: "HTTP" },
        ],
      },
    );
    expect(merged.dependsOn).toHaveLength(30);
    expect((merged.dependsOn as unknown[]).at(-1)).toEqual({
      to: "C-neuf",
      via: "AMQP",
      async: true,
    });
    expect(mergeLinks({ name: "Api" }, { owns: [], serves: [], dependsOn: [] })).toEqual({
      name: "Api",
    });
  });

  it("publishZoneIn : zone écartée avec motif compté, ou zone faite ; lancement arrêté → stopped", async () => {
    const fake = writerOf({
      id: LAUNCH.id,
      status: "running",
      proposedCount: 0,
      discardReasons: { truncated: 2 },
    });
    const discarded = { zone: "Achats", accepted: [], discarded: 1, reason: "truncated" as const };
    expect(await publishZoneIn(fake.client, LAUNCH, discarded, NOW)).toBe("published");
    expect(fake.calls.at(-1)?.data).toMatchObject({
      zonesDiscarded: { increment: 1 },
      discardReasons: { truncated: 3 },
      discardedCount: { increment: 1 },
    });
    await publishZoneIn(fake.client, LAUNCH, { zone: "Achats", accepted: [], discarded: 0 }, NOW);
    expect(fake.calls.at(-1)?.data).toMatchObject({ zonesDone: { increment: 1 } });
    expect(fake.calls.some((call) => call.op === "proposal.createMany")).toBe(false);
    const stopped = writerOf({ id: LAUNCH.id, status: "cancelled" });
    expect(await publishZoneIn(stopped.client, LAUNCH, discarded, NOW)).toBe("stopped");
    expect(stopped.calls).toEqual([]);
  });

  it("TK-114e (B670) : publishZoneIn compte les sections déjà présentes dans discard_reasons.existing_section", async () => {
    const fake = writerOf({
      id: LAUNCH.id,
      status: "running",
      proposedCount: 0,
      discardReasons: { truncated: 1, existing_section: 2 },
    });
    const zone = { zone: "Document", accepted: [], discarded: 3, existingSections: 3 };
    await publishZoneIn(fake.client, LAUNCH, zone, NOW);
    expect(fake.calls.at(-1)?.data).toMatchObject({
      zonesDone: { increment: 1 },
      discardedCount: { increment: 3 },
      discardReasons: { truncated: 1, existing_section: 5 },
    });
    const none = writerOf({
      id: LAUNCH.id,
      status: "running",
      proposedCount: 0,
      discardReasons: {},
    });
    await publishZoneIn(none.client, LAUNCH, { ...zone, existingSections: 0 }, NOW);
    expect(none.calls.at(-1)?.data).not.toHaveProperty("discardReasons");
  });

  it("publishCoverageIn : complément seulement sur une proposition pending non appliquée du lancement", async () => {
    const proposals = [
      {
        id: "p1",
        launchId: LAUNCH.id,
        status: "pending",
        appliedBatchId: null,
        payload: { serves: ["F-1"] },
      },
      {
        id: "p2",
        launchId: LAUNCH.id,
        status: "accepted",
        appliedBatchId: "b",
        payload: { serves: [] },
      },
      {
        id: "p3",
        launchId: "autre-lancement",
        status: "pending",
        appliedBatchId: null,
        payload: {},
      },
    ];
    const fake = writerOf({ id: LAUNCH.id, status: "running", proposedCount: 0 }, proposals);
    const complements = ["p1", "p2", "p3"].map((id) => ({ id, owns: [], serves: ["F-2"] }));
    const outcome = await publishCoverageIn(
      fake.client,
      LAUNCH,
      { accepted: [], complements, discarded: 0, call: true },
      NOW,
    );
    expect(outcome).toBe("published");
    expect(proposals.map((p) => p.payload)).toEqual([
      { serves: ["F-1", "F-2"] },
      { serves: [] },
      {},
    ]);
    expect(fake.calls.at(-1)?.data).toMatchObject({ coverageCalls: { increment: 1 } });
    const rule = await publishCoverageIn(
      fake.client,
      LAUNCH,
      { accepted: [], complements: [], discarded: 0, call: false },
      NOW,
    );
    expect(rule).toBe("published");
    expect(fake.calls.at(-1)?.data).not.toHaveProperty("coverageCalls");
  });

  it("launchProposalsIn : appliquée → applied, charge non objet → {}", async () => {
    const fake = writerOf({}, [
      {
        id: "a",
        kind: "component",
        zone: "Z",
        title: "A",
        status: "pending",
        appliedBatchId: null,
        payload: [],
      },
      {
        id: "b",
        kind: "archflow",
        zone: "Z",
        title: "B",
        status: "accepted",
        appliedBatchId: "x",
        payload: { flow: "P-1" },
      },
    ]);
    const rows = await launchProposalsIn(fake.client, LAUNCH);
    expect(rows.map(({ id, applied, payload }) => ({ id, applied, payload }))).toEqual([
      { id: "a", applied: false, payload: {} },
      { id: "b", applied: true, payload: { flow: "P-1" } },
    ]);
  });
});
