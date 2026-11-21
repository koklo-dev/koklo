import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedLarge, seedPlanche } from "../src/seed-volume.ts";
import { SEED_VOLUMES } from "../src/seed-volumes.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";

/**
 * TK-112 lot A (cas 12) : flux d'architecture `archflow` des jeux de volume (planche : 18, large : 300). Un flux est un
 * participant acteur plus deux composants connus, des messages dans la forme du schéma, des liens F/R existants ; le
 * `titre` d'index est son identifiant. Aucune proposition d'agent supplémentaire (le seed des propositions est inchangé).
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
  sort: number;
  data: {
    id: string;
    titre: string;
    participants: string[];
    messages: Record<string, unknown>[];
    fonctionnalites: string[];
    regles: string[];
    decisions: string[];
  };
}

const entitiesOf = async (name: string, kind: string) => {
  const [project] = await db.query<{ id: string }>("SELECT id FROM projects WHERE name = $1", [
    name,
  ]);
  return db.query<Row>(
    `SELECT e.spec_id, e.path, e.sort, e.data FROM spec_entities e
       JOIN spec_snapshots s ON s.id = e.snapshot_id JOIN project_repos r ON r.id = s.repo_id
      WHERE r.project_id = $1 AND e.kind = $2 ORDER BY e.sort`,
    [project?.id, kind],
  );
};

const checkFlows = async (name: string, expected: number) => {
  const flows = await entitiesOf(name, "archflow");
  expect(flows).toHaveLength(expected);
  const components = new Set((await entitiesOf(name, "component")).map((row) => row.spec_id));
  const [file] = await entitiesOf(name, "roles");
  const listed = (file?.data ?? { roles: [] }) as unknown as { roles: { id: string }[] };
  const roles = new Set(listed.roles.map((role) => role.id));
  for (const flow of flows) {
    expect(flow.spec_id).toMatch(/^P-flux-\d{3,}$/);
    expect(flow.data.id).toBe(flow.spec_id);
    expect(flow.data.titre).toBe(flow.spec_id);
    expect(flow.path).toBe(`architecture/flows/${flow.spec_id}.yaml`);
    const [actor, ...others] = flow.data.participants;
    expect(roles.has(actor as string), actor).toBe(true);
    expect(others.length).toBeGreaterThanOrEqual(2);
    for (const id of others) expect(components.has(id), id).toBe(true);
    const known = new Set(flow.data.participants);
    const sent = flow.data.messages.flatMap((entry) =>
      "bloc" in entry ? ((entry.messages as Record<string, string>[] | undefined) ?? []) : [entry],
    ) as { de: string; vers: string; texte: string }[];
    expect(sent.length).toBeGreaterThanOrEqual(2);
    for (const message of sent) {
      expect(known.has(message.de) && known.has(message.vers)).toBe(true);
      expect(message.texte).not.toBe("");
    }
    expect(flow.data.fonctionnalites[0]).toMatch(/^F-\d{3,}$/);
    expect(flow.data.regles[0]).toMatch(/^R-\d{3,}$/);
  }
  return flows;
};

describe("TK-112 flux d'architecture des jeux de volume", () => {
  it("planche : 18 flux valides, dont un bloc alt et un séparateur ; un second chargement ne duplique rien", async () => {
    await seedPlanche(db.url);
    await seedPlanche(db.url);
    expect(SEED_VOLUMES.planche.archflows).toBe(18);
    const flows = await checkFlows("Volume · planche", 18);
    const blocks = flows.flatMap((flow) =>
      flow.data.messages.flatMap((entry) => ("bloc" in entry ? [entry.bloc] : [])),
    );
    expect(blocks).toContain("alt");
    expect(blocks).toContain("separateur");
    const [proposals] = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM agent_proposals p JOIN projects pr ON pr.id = p.project_id
        WHERE pr.name = 'Volume · planche' AND p.deliverable = 'architecture'`,
    );
    expect(proposals?.n).toBe(SEED_VOLUMES.planche.architectureProposals);
  }, 240_000);

  it("large : 300 flux valides (de quoi dépasser les pages de 50)", async () => {
    await seedLarge(db.url);
    expect(SEED_VOLUMES.large.archflows).toBe(300);
    await checkFlows("Volume · charge", 300);
  }, 240_000);
});
