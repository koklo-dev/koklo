import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedLarge, seedPlanche } from "../src/seed-volume.ts";
import { PENDING_VOLUMES, SEED_VOLUMES } from "../src/seed-volumes.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";

/**
 * TK-103 lot A (B343) : `seed:large` insère 300 règles, 18 parcours, 3 rôles et 47 permissions dans `spec_entities` ;
 * `seed:planche` 86 règles, 18 parcours, 3 rôles, 47 permissions. Les volumes `rules` et `journeys` ne sont plus « à venir ».
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
  await seedLarge(db.url);
  await seedPlanche(db.url);
}, 240_000);
afterAll(async () => {
  await db?.dispose();
}, 60_000);

const projectId = async (name: string) =>
  (await db.query<{ id: string }>("SELECT id FROM projects WHERE name = $1", [name]))[0]?.id;
const rows = async (name: string, kind: string) =>
  db.query<{ spec_id: string; sort: number; path: string; data: Record<string, unknown> }>(
    `SELECT e.spec_id, e.sort, e.path, e.data FROM spec_entities e
       JOIN spec_snapshots s ON s.id = e.snapshot_id JOIN project_repos r ON r.id = s.repo_id
      WHERE r.project_id = $1 AND e.kind = $2 ORDER BY e.sort`,
    [await projectId(name), kind],
  );

describe("TK-103 volumes de règles, parcours et rôles", () => {
  it("ne déclare plus rules ni journeys en attente", () => {
    expect(PENDING_VOLUMES.large).not.toHaveProperty("rules");
    expect(PENDING_VOLUMES.planche).not.toHaveProperty("rules");
    expect(PENDING_VOLUMES.planche).not.toHaveProperty("journeys");
    expect(SEED_VOLUMES.large).toMatchObject({ rules: 300, flows: 18, roles: 3, permissions: 47 });
    expect(SEED_VOLUMES.planche).toMatchObject({ rules: 86, flows: 18, roles: 3, permissions: 47 });
  });

  it("large : 300 règles triées par numéro, avec titre, type et énoncé", async () => {
    const rules = await rows("Volume · charge", "rule");
    expect(rules).toHaveLength(300);
    expect(rules[0]?.spec_id).toBe("R-001");
    expect(rules[249]).toMatchObject({ spec_id: "R-250", sort: 250 });
    expect(rules[249]?.path).toMatch(/^domain\/rules\/R-250-.+\.md$/);
    const types = new Set(rules.map((r) => r.data.type));
    expect([...types].sort()).toEqual(["calcul", "contrainte", "workflow"]);
    for (const rule of rules) {
      expect(rule.data.titre, rule.spec_id).toEqual(expect.any(String));
      expect(rule.data.enonce, rule.spec_id).toEqual(expect.any(String));
      if (rule.data.type === "workflow") {
        expect((rule.data.etats as string[]).length).toBeGreaterThanOrEqual(2);
      }
    }
  }, 60_000);

  it("large : 18 parcours à étapes et 1 fichier de rôles (3 rôles, 47 permissions en groupes de ressources)", async () => {
    const flows = await rows("Volume · charge", "flow");
    expect(flows).toHaveLength(18);
    expect(flows[0]?.path).toMatch(/^design\/flows\/P-.+\.yaml$/);
    expect((flows[0]?.data.etapes as unknown[] | undefined)?.length).toBeGreaterThanOrEqual(3);
    const [file, ...others] = await rows("Volume · charge", "roles");
    expect(others).toEqual([]);
    expect(file).toMatchObject({ spec_id: "roles", path: "domain/roles.yaml" });
    const data = file?.data as {
      roles: { id: string; permissions: string[]; restrictions?: Record<string, string> }[];
      permissions: { id: string; ressource: string }[];
    };
    expect(data.roles).toHaveLength(3);
    expect(data.permissions).toHaveLength(47);
    expect(new Set(data.permissions.map((p) => p.ressource)).size).toBe(12);
    expect(data.roles.some((r) => Object.keys(r.restrictions ?? {}).length > 0)).toBe(true);
  }, 60_000);

  it("planche : 86 règles, 18 parcours, 3 rôles et 47 permissions", async () => {
    expect(await rows("Volume · planche", "rule")).toHaveLength(86);
    expect(await rows("Volume · planche", "flow")).toHaveLength(18);
    const [file] = await rows("Volume · planche", "roles");
    expect((file?.data.permissions as unknown[] | undefined)?.length).toBe(47);
  }, 60_000);

  it("est idempotent : un second chargement ne duplique rien", async () => {
    await seedLarge(db.url);
    expect(await rows("Volume · charge", "rule")).toHaveLength(300);
    expect(await rows("Volume · charge", "flow")).toHaveLength(18);
  }, 120_000);
});
