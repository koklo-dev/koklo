import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedLarge, seedPlanche } from "../src/seed-volume.ts";
import { SEED_VOLUMES } from "../src/seed-volumes.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";

/**
 * TK-113 lot A (cas 10) : décisions d'architecture `adr` des jeux de volume (planche : 23 dont 19 acceptées, 3 proposées et 1
 * remplacée ; large : 300). Format d'index du worker (`architecture/adr/ADR-nnn-<slug>.md`) : `titre`, `statut`,
 * `remplacee_par`, `date`, `liens` existants, sections lisibles. Les 12 propositions `adr` de la planche sont conservées.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);
afterAll(async () => {
  await db?.dispose();
}, 60_000);

interface Row {
  spec_id: string;
  path: string;
  data: {
    id: string;
    titre: string;
    statut: "proposee" | "acceptee" | "remplacee";
    remplacee_par?: string;
    date: string;
    decideurs: string[];
    liens: string[];
    contexte: string;
    decision: string;
    consequences: { positives: string[]; a_accepter: string[] };
    alternatives: { nom: string; raison: string }[];
    en_clair?: string;
  };
}

const entitiesOf = async (name: string, kind: string) => {
  const [project] = await db.query<{ id: string }>("SELECT id FROM projects WHERE name = $1", [
    name,
  ]);
  return db.query<Row>(
    `SELECT e.spec_id, e.path, e.data FROM spec_entities e
       JOIN spec_snapshots s ON s.id = e.snapshot_id JOIN project_repos r ON r.id = s.repo_id
      WHERE r.project_id = $1 AND e.kind = $2 ORDER BY e.sort`,
    [project?.id, kind],
  );
};

const checkAdrs = async (name: string, expected: number) => {
  const adrs = await entitiesOf(name, "adr");
  expect(adrs).toHaveLength(expected);
  const ids = new Set(adrs.map((row) => row.spec_id));
  const components = new Set((await entitiesOf(name, "component")).map((row) => row.spec_id));
  for (const adr of adrs) {
    expect(adr.spec_id).toMatch(/^ADR-\d{3,}$/);
    expect(adr.data.id).toBe(adr.spec_id);
    expect(adr.data.titre).not.toBe("");
    expect(adr.path).toMatch(new RegExp(`^architecture/adr/${adr.spec_id}-[a-z0-9-]+\\.md$`));
    expect(adr.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(adr.data.contexte).not.toBe("");
    expect(adr.data.decision).not.toBe("");
    expect(adr.data.consequences.positives.length).toBeGreaterThan(0);
    expect(adr.data.alternatives.length).toBeGreaterThan(0);
    expect(adr.data.liens.some((link) => components.has(link))).toBe(true);
    if (adr.data.statut === "remplacee") {
      expect(ids.has(adr.data.remplacee_par as string), adr.spec_id).toBe(true);
    } else {
      expect(adr.data.remplacee_par).toBeUndefined();
    }
  }
  return adrs;
};

const count = (adrs: Row[], status: string) => adrs.filter((row) => row.data.statut === status);

describe("TK-113 décisions d'architecture des jeux de volume", () => {
  it("planche : 23 décisions (19 acceptées, 3 proposées, 1 remplacée), propositions adr conservées, rechargement sans doublon", async () => {
    await seedPlanche(db.url);
    await seedPlanche(db.url);
    expect(SEED_VOLUMES.planche.adrs).toBe(23);
    const adrs = await checkAdrs("Volume · planche", 23);
    expect(count(adrs, "acceptee")).toHaveLength(19);
    expect(count(adrs, "proposee")).toHaveLength(3);
    expect(count(adrs, "remplacee")).toHaveLength(1);
    const [proposals] = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM agent_proposals p JOIN projects pr ON pr.id = p.project_id
        WHERE pr.name = 'Volume · planche' AND p.deliverable = 'architecture' AND p.kind = 'adr'`,
    );
    expect(proposals?.n).toBe(12);
  }, 240_000);

  it("large : 300 décisions (de quoi dépasser les pages de 50), tous statuts représentés", async () => {
    await seedLarge(db.url);
    expect(SEED_VOLUMES.large.adrs).toBe(300);
    const adrs = await checkAdrs("Volume · charge", 300);
    for (const status of ["acceptee", "proposee", "remplacee"]) {
      expect(count(adrs, status).length, status).toBeGreaterThan(0);
    }
  }, 240_000);
});
