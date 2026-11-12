import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_IDS, seed } from "../src/seed.ts";
import { seedLarge, seedPlanche } from "../src/seed-volume.ts";
import { PENDING_MODELS, PENDING_VOLUMES, SEED_VOLUMES } from "../src/seed-volumes.ts";
import { packageRoot, runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";

/**
 * TK-94 (B19) : jeux de volume `seed:large` (1 000 fonctionnalités, 80 tables, 500 tickets) et
 * `seed:planche` (248 fonctionnalités, 65 tables, 47 points d'accès). Deux projets distincts de
 * l'organisation de démo, idempotents, refusés en production ; le projet de démo n'est pas touché.
 * Les volumes des modèles qui n'existent pas encore (règles, propositions, parcours, lignes
 * d'exemple) sont déclarés dans `seed-volumes.ts`, avec le ticket qui créera le modèle.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

const projectByName = async (name: string) => {
  const [row] = await db.query<{ id: string; organization_id: string }>(
    "SELECT id, organization_id FROM projects WHERE name = $1",
    [name],
  );
  return row;
};

const count = async (table: string, projectColumn: string, projectId: string) => {
  const [row] = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table} WHERE ${projectColumn} = $1`,
    [projectId],
  );
  return row?.n ?? 0;
};

/** Contenu d'un projet de volume, sans les colonnes d'horloge : sert à prouver l'idempotence. */
async function fingerprint(projectId: string): Promise<unknown> {
  const rows = (sql: string) => db.query(sql, [projectId]);
  return {
    features: await rows(
      `SELECT f.spec_id, f.title, f.status, f.priority, f.file_path, f.id
         FROM spec_features f JOIN spec_snapshots s ON s.id = f.snapshot_id
         JOIN project_repos r ON r.id = s.repo_id WHERE r.project_id = $1 ORDER BY f.spec_id`,
    ),
    tickets: await rows(
      `SELECT id, key, title, status, priority, pkg, sprint_id FROM tickets
        WHERE project_id = $1 ORDER BY key`,
    ),
    counters: await rows(
      "SELECT name, last_value FROM project_counters WHERE project_id = $1 ORDER BY name",
    ),
  };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-94 seed:large", () => {
  it("crée le projet « Volume · charge » : 1 000 fonctionnalités, 80 tables, 500 tickets", async () => {
    await seedLarge(db.url);

    const project = await projectByName("Volume · charge");
    expect(project, "projet de charge").toBeDefined();
    expect(project?.organization_id).toBe(SEED_IDS.organization);
    const id = project?.id as string;
    const [features] = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM spec_features f JOIN spec_snapshots s ON s.id = f.snapshot_id
         JOIN project_repos r ON r.id = s.repo_id WHERE r.project_id = $1`,
      [id],
    );
    const [tables] = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM spec_tables t JOIN spec_snapshots s ON s.id = t.snapshot_id
         JOIN project_repos r ON r.id = s.repo_id WHERE r.project_id = $1`,
      [id],
    );
    expect(features?.n).toBe(SEED_VOLUMES.large.features);
    expect(features?.n).toBe(1000);
    expect(tables?.n).toBe(80);
    expect(await count("tickets", "project_id", id)).toBe(500);
  }, 120_000);

  it("deux exécutions donnent exactement le même état (idempotence)", async () => {
    const id = (await projectByName("Volume · charge"))?.id as string;
    const before = await fingerprint(id);
    await seedLarge(db.url);
    expect(await fingerprint(id)).toEqual(before);
    expect(await count("tickets", "project_id", id)).toBe(500);
  }, 120_000);

  it("l'index est exploitable : instantané prêt, tête main, 1 à 4 critères, F-001 à F-1000", async () => {
    const id = (await projectByName("Volume · charge"))?.id as string;
    const [head] = await db.query<{ status: string; branch: string }>(
      `SELECT s.status, h.branch FROM spec_heads h JOIN spec_snapshots s ON s.id = h.snapshot_id
         JOIN project_repos r ON r.id = h.repo_id WHERE r.project_id = $1`,
      [id],
    );
    expect(head).toEqual({ status: "ready", branch: "main" });
    const [repo] = await db.query<{ role: string }>(
      "SELECT role FROM project_repos WHERE project_id = $1",
      [id],
    );
    expect(repo?.role).toBe("spec");
    const spread = await db.query<{ criteria: number; n: number }>(
      `SELECT c.n AS criteria, count(*)::int AS n FROM (
         SELECT f.id, count(sc.id)::int AS n FROM spec_features f
           JOIN spec_snapshots s ON s.id = f.snapshot_id JOIN project_repos r ON r.id = s.repo_id
           LEFT JOIN spec_criteria sc ON sc.feature_id = f.id WHERE r.project_id = $1 GROUP BY f.id
       ) c GROUP BY c.n ORDER BY c.n`,
      [id],
    );
    expect(spread.map((r) => r.criteria)).toEqual([1, 2, 3, 4]);
    const [bounds] = await db.query<{ low: string; high: string }>(
      `SELECT min(f.spec_id) AS low, max(f.spec_number)::text AS high FROM spec_features f
         JOIN spec_snapshots s ON s.id = f.snapshot_id JOIN project_repos r ON r.id = s.repo_id
        WHERE r.project_id = $1`,
      [id],
    );
    expect(bounds).toEqual({ low: "F-001", high: "1000" });
  });

  it("les tickets couvrent 7 statuts, au moins 60 dans une colonne, compteur de projet cohérent", async () => {
    const id = (await projectByName("Volume · charge"))?.id as string;
    const byStatus = await db.query<{ status: string; n: number }>(
      "SELECT status, count(*)::int AS n FROM tickets WHERE project_id = $1 GROUP BY status",
      [id],
    );
    expect(byStatus.map((r) => r.status).sort()).toEqual(
      ["backlog", "blocked", "cancelled", "done", "in_progress", "in_review", "todo"].sort(),
    );
    expect(Math.max(...byStatus.map((r) => r.n))).toBeGreaterThanOrEqual(60);
    const [counter] = await db.query<{ last_value: number }>(
      "SELECT last_value FROM project_counters WHERE project_id = $1 AND name = 'ticket'",
      [id],
    );
    expect(counter?.last_value).toBe(500);
    const [active] = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM sprints WHERE project_id = $1 AND status = 'active'",
      [id],
    );
    expect(active?.n).toBe(1);
  });

  it("contient des titres connus pour les tests de recherche (annulation groupée en page 15)", async () => {
    const id = (await projectByName("Volume · charge"))?.id as string;
    const rows = await db.query<{ spec_id: string; spec_number: number }>(
      `SELECT f.spec_id, f.spec_number FROM spec_features f
         JOIN spec_snapshots s ON s.id = f.snapshot_id JOIN project_repos r ON r.id = s.repo_id
        WHERE r.project_id = $1 AND f.search @@ to_tsquery('french', 'annul:* & group:*')`,
      [id],
    );
    expect(rows).toHaveLength(1);
    const rank = rows[0]?.spec_number as number;
    expect(Math.ceil(rank / 50), "page de 50 contenant la fonctionnalité").toBe(15);
  });

  it("refuse de s'exécuter en production, avant toute connexion", async () => {
    await expect(
      seedLarge("postgresql://inconnu:0/inconnu", { env: { NODE_ENV: "production" } }),
    ).rejects.toThrow(/Seed refusé/);
    await expect(
      seedPlanche("postgresql://inconnu:0/inconnu", { env: { NODE_ENV: "production" } }),
    ).rejects.toThrow(/Seed refusé/);
  });
});

describe("TK-94 seed:planche", () => {
  it("crée le projet « Volume · planche » : 248 fonctionnalités, 65 tables, 47 points d'accès", async () => {
    await seedPlanche(db.url);

    const project = await projectByName("Volume · planche");
    expect(project).toBeDefined();
    const id = project?.id as string;
    const counts = await db.query<{ what: string; n: number }>(
      `SELECT 'features' AS what, count(*)::int AS n FROM spec_features f
         JOIN spec_snapshots s ON s.id = f.snapshot_id JOIN project_repos r ON r.id = s.repo_id
         WHERE r.project_id = $1
       UNION ALL SELECT 'tables', count(*)::int FROM spec_tables t
         JOIN spec_snapshots s ON s.id = t.snapshot_id JOIN project_repos r ON r.id = s.repo_id
         WHERE r.project_id = $1
       UNION ALL SELECT 'endpoints', count(*)::int FROM spec_endpoints e
         JOIN spec_snapshots s ON s.id = e.snapshot_id JOIN project_repos r ON r.id = s.repo_id
         WHERE r.project_id = $1`,
      [id],
    );
    expect(Object.fromEntries(counts.map((r) => [r.what, r.n]))).toEqual({
      features: 248,
      tables: 65,
      endpoints: 47,
    });
    expect(await count("tickets", "project_id", id)).toBe(SEED_VOLUMES.planche.tickets);
  }, 120_000);

  it("ne touche ni le projet de démo ni « Volume · charge » ; idempotent", async () => {
    await seed(db.url);
    const large = (await projectByName("Volume · charge"))?.id as string;
    const planche = (await projectByName("Volume · planche"))?.id as string;
    const demo = SEED_IDS.project;
    const [demoBefore, largeBefore, plancheBefore] = [
      await fingerprint(demo),
      await fingerprint(large),
      await fingerprint(planche),
    ];

    await seedPlanche(db.url);

    expect(await fingerprint(demo)).toEqual(demoBefore);
    expect(await fingerprint(large)).toEqual(largeBefore);
    expect(await fingerprint(planche)).toEqual(plancheBefore);
    expect(large).not.toBe(planche);
  }, 120_000);
});

describe("TK-99a seed:large : 400 propositions de l'agent", () => {
  it("insère un lancement terminé et 400 propositions en 3 groupes de plus de 30, statuts mêlés", async () => {
    await seedLarge(db.url);
    const project = await projectByName("Volume · charge");
    const id = project?.id as string;
    expect(SEED_VOLUMES.large.proposals).toBe(400);
    const launches = await db.query<{
      status: string;
      proposed_count: number;
      deliverable: string;
    }>("SELECT status, proposed_count, deliverable FROM agent_launches WHERE project_id = $1", [
      id,
    ]);
    expect(launches).toEqual([{ status: "done", proposed_count: 400, deliverable: "functional" }]);
    const groups = await db.query<{ kind: string; zone: string; n: number; pending: number }>(
      `SELECT kind, zone, count(*)::int AS n, count(*) FILTER (WHERE status = 'pending')::int AS pending
         FROM agent_proposals WHERE project_id = $1 GROUP BY kind, zone ORDER BY zone`,
      [id],
    );
    expect(groups).toHaveLength(3);
    expect(groups.reduce((sum, g) => sum + g.n, 0)).toBe(400);
    for (const group of groups) {
      expect(group.n).toBeGreaterThan(30);
      expect(group.pending).toBeGreaterThan(0);
      expect(group.pending).toBeLessThan(group.n);
    }
    expect(await count("agent_proposals", "project_id", id)).toBe(400);
  }, 120_000);

  it("est idempotent : un second chargement ne duplique rien", async () => {
    await seedLarge(db.url);
    const project = await projectByName("Volume · charge");
    const id = project?.id as string;
    expect(await count("agent_proposals", "project_id", id)).toBe(400);
    expect(await count("agent_launches", "project_id", id)).toBe(1);
  }, 120_000);

  it("seed:planche n'insère aucune proposition", async () => {
    await seedPlanche(db.url);
    const project = await projectByName("Volume · planche");
    expect(await count("agent_proposals", "project_id", project?.id as string)).toBe(0);
  }, 120_000);
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-101 seed:large et seed:planche : index d'entités (spec_entities, entities_indexed_at)", () => {
  const entityCounts = (projectId: string) =>
    db.query<{ kind: string; n: number }>(
      `SELECT e.kind, count(*)::int AS n FROM spec_entities e
         JOIN spec_snapshots s ON s.id = e.snapshot_id JOIN project_repos r ON r.id = s.repo_id
        WHERE r.project_id = $1 GROUP BY e.kind ORDER BY e.kind`,
      [projectId],
    );

  it("seed:large indexe les 1 000 fonctionnalités, 80 tables et les points d'accès, et pose entities_indexed_at", async () => {
    await seedLarge(db.url);
    const id = (await projectByName("Volume · charge"))?.id as string;

    const counts = Object.fromEntries((await entityCounts(id)).map((row) => [row.kind, row.n]));
    expect(counts).toEqual({
      endpoint: SEED_VOLUMES.large.endpoints,
      feature: 1000,
      table: 80,
    });
    const [snapshot] = await db.query<{ entities_indexed_at: Date | null }>(
      `SELECT s.entities_indexed_at FROM spec_snapshots s JOIN project_repos r ON r.id = s.repo_id
        WHERE r.project_id = $1`,
      [id],
    );
    expect(snapshot?.entities_indexed_at).not.toBeNull();
  }, 120_000);

  it("chaque entité porte un titre, un chemin, un rang et un hachage valides ; F-987 est trouvable par préfixe et par mot", async () => {
    const id = (await projectByName("Volume · charge"))?.id as string;
    const [shape] = await db.query<{ bad: number }>(
      `SELECT count(*)::int AS bad FROM spec_entities e
         JOIN spec_snapshots s ON s.id = e.snapshot_id JOIN project_repos r ON r.id = s.repo_id
        WHERE r.project_id = $1 AND (coalesce(e.data ->> 'titre', '') = '' OR e.path = ''
          OR e.content_hash !~ '^[0-9a-f]{64}$' OR e.sort < 1)`,
      [id],
    );
    expect(shape?.bad).toBe(0);
    const found = await db.query<{ spec_id: string }>(
      `SELECT e.spec_id FROM spec_entities e
         JOIN spec_snapshots s ON s.id = e.snapshot_id JOIN project_repos r ON r.id = s.repo_id
        WHERE r.project_id = $1 AND e.kind = 'feature'
          AND (e.spec_id ILIKE 'F-987%' OR e.search @@ to_tsquery('french', 'annul:* & group:*'))
        ORDER BY e.sort`,
      [id],
    );
    expect(found.map((row) => row.spec_id)).toEqual(["F-703", "F-987"]);
  });

  it("les identifiants des entités sont ceux des tables d'index (spec_features, spec_tables, spec_endpoints)", async () => {
    const id = (await projectByName("Volume · charge"))?.id as string;
    const [gap] = await db.query<{ missing: number }>(
      `SELECT count(*)::int AS missing FROM (
         SELECT f.spec_id, f.snapshot_id FROM spec_features f
         UNION ALL SELECT t.spec_id, t.snapshot_id FROM spec_tables t
         UNION ALL SELECT p.spec_id, p.snapshot_id FROM spec_endpoints p) i
         JOIN spec_snapshots s ON s.id = i.snapshot_id JOIN project_repos r ON r.id = s.repo_id
        WHERE r.project_id = $1
          AND NOT EXISTS (SELECT 1 FROM spec_entities e WHERE e.snapshot_id = i.snapshot_id AND e.spec_id = i.spec_id)`,
      [id],
    );
    expect(gap?.missing).toBe(0);
  });

  it("est idempotent : un second chargement ne duplique rien ; seed:planche indexe aussi ses 248 fonctionnalités", async () => {
    const id = (await projectByName("Volume · charge"))?.id as string;
    const before = await entityCounts(id);
    await seedLarge(db.url);
    expect(await entityCounts(id)).toEqual(before);

    await seedPlanche(db.url);
    const planche = (await projectByName("Volume · planche"))?.id as string;
    const counts = Object.fromEntries(
      (await entityCounts(planche)).map((row) => [row.kind, row.n]),
    );
    expect(counts).toMatchObject({ feature: 248, table: 65, endpoint: 47 });
  }, 120_000);
});

describe("TK-94 volumes déclarés des modèles à venir (lecture prudente, B34)", () => {
  it("déclare les volumes de la passation 07 §6 et 08 §4 avec le ticket qui créera le modèle", () => {
    expect(PENDING_VOLUMES.large).toMatchObject({ rules: { count: 300 } });
    // TK-99a : les 400 propositions sont désormais insérées, plus seulement déclarées.
    expect(PENDING_VOLUMES.large).not.toHaveProperty("proposals");
    expect(PENDING_VOLUMES.planche).toMatchObject({
      rules: { count: 86 },
      journeys: { count: 18 },
      sampleRows: { count: 1240 },
    });
    for (const profile of Object.values(PENDING_VOLUMES)) {
      for (const [type, declared] of Object.entries(profile)) {
        expect(declared.ticket, `ticket d'accueil de ${type}`).toMatch(/\S/);
      }
    }
  });

  it("un test échoue si un modèle « à venir » apparaît dans schema.prisma sans être seedé", () => {
    const schema = readFileSync(join(packageRoot, "prisma", "schema.prisma"), "utf8");
    const declared = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
    const arrived = PENDING_MODELS.filter((model) => declared.includes(model));
    expect(
      arrived,
      `modèle(s) apparu(s) dans le schéma : étendre seed:large et seed:planche puis retirer de PENDING_MODELS`,
    ).toEqual([]);
  });
});
