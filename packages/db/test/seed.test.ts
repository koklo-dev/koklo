import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_IDS, seed } from "../src/seed.ts";
import { runPrismaOrThrow } from "./helpers/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "./helpers/test-database.ts";

const TABLES = ["users", "organizations", "members", "projects"] as const;

type Snapshot = Record<(typeof TABLES)[number], unknown[]>;

async function snapshot(db: TestDatabase): Promise<Snapshot> {
  const result: Partial<Snapshot> = {};
  for (const table of TABLES) {
    result[table] = await db.query(`SELECT * FROM ${table} ORDER BY id`);
  }
  return result as Snapshot;
}

/** Migre la base puis exécute le seed deux fois, en photographiant l'état après chaque passage. */
async function seedTwice(db: TestDatabase): Promise<[Snapshot, Snapshot]> {
  runPrismaOrThrow(["migrate", "deploy"], db.url);
  await seed(db.url);
  const first = await snapshot(db);
  await seed(db.url);
  return [first, await snapshot(db)];
}

describe("seed déterministe (TK-8)", () => {
  let db: TestDatabase;
  let first: Snapshot;
  let second: Snapshot;

  beforeAll(async () => {
    db = await createTestDatabase();
    [first, second] = await seedTwice(db);
  }, 180_000);

  afterAll(async () => {
    await db?.dispose();
  });

  it("produit exactement la même base après deux exécutions successives", () => {
    expect(second).toEqual(first);
  });

  it("crée une seule organisation de démo aux identifiants fixes", () => {
    expect(second.organizations).toHaveLength(1);
    expect(second.organizations[0]).toMatchObject({ id: SEED_IDS.organization });
  });

  it("crée deux utilisateurs aux identifiants fixes", () => {
    const ids = (second.users as { id: string }[]).map((row) => row.id).sort();

    expect(ids).toEqual([SEED_IDS.adminUser, SEED_IDS.clientUser].sort());
  });

  it("crée deux membres : un admin et un client, rattachés à l'organisation", () => {
    const members = second.members as {
      id: string;
      role: string;
      user_id: string;
      organization_id: string;
    }[];

    expect(members).toHaveLength(2);
    expect(members.map((m) => m.organization_id)).toEqual([
      SEED_IDS.organization,
      SEED_IDS.organization,
    ]);
    const byRole = Object.fromEntries(members.map((m) => [m.role, m]));
    expect(Object.keys(byRole).sort()).toEqual(["admin", "client"]);
    expect(byRole.admin).toMatchObject({ id: SEED_IDS.adminMember, user_id: SEED_IDS.adminUser });
    expect(byRole.client).toMatchObject({
      id: SEED_IDS.clientMember,
      user_id: SEED_IDS.clientUser,
    });
  });

  it("crée un projet rattaché à l'organisation de démo", () => {
    expect(second.projects).toHaveLength(1);
    expect(second.projects[0]).toMatchObject({
      id: SEED_IDS.project,
      organization_id: SEED_IDS.organization,
    });
  });
});
