import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  insertBatch,
  insertCriterion,
  insertEndpoint,
  insertFeature,
  insertFeatureLink,
  insertFullTree,
  insertHead,
  insertInstallation,
  insertOperation,
  insertRepo,
  insertSnapshot,
  insertSpecTable,
  sha,
} from "./support/spec-fixtures.ts";
import { insertScope, type Scope, sqlState } from "./support/ticket-fixtures.ts";

const UNIQUE = "23505";
const CHECK = "23514";
const FOREIGN_KEY = "23503";
const BAD_ENUM = "22P02";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: string }>(sql, params))[0]?.n);

describe("TK-41 C4 installations", () => {
  let a: Scope;
  let b: Scope;
  beforeAll(async () => {
    a = await insertScope(db, "inst-a");
    b = await insertScope(db, "inst-b");
  });

  it("UNIQUE(provider, external_id) : une 2e organisation ne peut pas revendiquer la même installation", async () => {
    await insertInstallation(db, a, { externalId: "12345" });

    expect(await sqlState(() => insertInstallation(db, b, { externalId: "12345" }))).toBe(UNIQUE);
    await insertInstallation(db, b, { externalId: "12346" });
  });

  it("owner_kind, status et provider hors énumération sont refusés", async () => {
    expect(await sqlState(() => insertInstallation(db, a, { ownerKind: "team" }))).toBe(BAD_ENUM);
    expect(await sqlState(() => insertInstallation(db, a, { status: "gone" }))).toBe(BAD_ENUM);
    expect(await sqlState(() => insertInstallation(db, a, { provider: "gitlab" }))).toBe(BAD_ENUM);
  });
});

describe("TK-41 C5 repos", () => {
  let scope: Scope;
  let installation: string;
  beforeAll(async () => {
    scope = await insertScope(db, "repos");
    installation = await insertInstallation(db, scope);
  });

  it("UNIQUE(installation_id, external_id)", async () => {
    await insertRepo(db, scope, installation, { externalId: "r-1" });

    expect(await sqlState(() => insertRepo(db, scope, installation, { externalId: "r-1" }))).toBe(
      UNIQUE,
    );
  });

  it("role et mode hors énumération sont refusés", async () => {
    expect(await sqlState(() => insertRepo(db, scope, installation, { role: "docs" }))).toBe(
      BAD_ENUM,
    );
    expect(await sqlState(() => insertRepo(db, scope, installation, { mode: "cloned" }))).toBe(
      BAD_ENUM,
    );
  });

  it("deux repos front et back coexistent dans un projet", async () => {
    const s = await insertScope(db, "repos-fb");
    const inst = await insertInstallation(db, s);
    await insertRepo(db, s, inst, { role: "front" });
    await insertRepo(db, s, inst, { role: "back" });

    expect(
      await count("SELECT count(*)::text AS n FROM project_repos WHERE project_id = $1", [
        s.projectId,
      ]),
    ).toBe(2);
  });
});

describe("TK-41 C5 repos : repos : porteur de spec et spec_path", () => {
  let scope: Scope;
  let installation: string;
  beforeAll(async () => {
    scope = await insertScope(db, "repos");
    installation = await insertInstallation(db, scope);
  });

  it("au plus un repo porteur de la spec par projet : second role='spec' refusé (23505)", async () => {
    const s = await insertScope(db, "repos-spec");
    const inst = await insertInstallation(db, s);
    await insertRepo(db, s, inst, { role: "spec" });

    expect(await sqlState(() => insertRepo(db, s, inst, { role: "spec" }))).toBe(UNIQUE);
  });

  it("un monorepo avec spec_path compte comme porteur, un sans spec_path non", async () => {
    const s = await insertScope(db, "repos-mono");
    const inst = await insertInstallation(db, s);
    await insertRepo(db, s, inst, { role: "monorepo", specPath: "koklo-spec" });

    expect(await sqlState(() => insertRepo(db, s, inst, { role: "spec" }))).toBe(UNIQUE);
    expect(
      await sqlState(() => insertRepo(db, s, inst, { role: "monorepo", specPath: "other/spec" })),
    ).toBe(UNIQUE);
    await insertRepo(db, s, inst, { role: "monorepo" });
  });

  it("un autre projet peut avoir son propre repo de spec", async () => {
    const s1 = await insertScope(db, "repos-p1");
    const s2 = await insertScope(db, "repos-p2");
    await insertRepo(db, s1, await insertInstallation(db, s1), { role: "spec" });
    await insertRepo(db, s2, await insertInstallation(db, s2), { role: "spec" });
  });

  it("CHECK spec_path : vide, absolu ou avec '..' refusés ; role='spec' avec spec_path refusé", async () => {
    for (const specPath of ["", "/abs", "a/../b", ".."]) {
      expect(
        await sqlState(() => insertRepo(db, scope, installation, { role: "monorepo", specPath })),
        JSON.stringify(specPath),
      ).toBe(CHECK);
    }
    expect(
      await sqlState(() =>
        insertRepo(db, scope, installation, { role: "spec", specPath: "koklo-spec" }),
      ),
    ).toBe(CHECK);
  });
});

describe("TK-41 C6 index de spec par commit", () => {
  let scope: Scope;
  let repo: string;
  beforeAll(async () => {
    scope = await insertScope(db, "index");
    repo = await insertRepo(db, scope, await insertInstallation(db, scope), { role: "spec" });
  });

  it("UNIQUE(repo_id, commit_sha) ; commit_sha identique dans un autre repo accepté", async () => {
    const commit = sha("c1");
    await insertSnapshot(db, scope, repo, commit);

    expect(await sqlState(() => insertSnapshot(db, scope, repo, commit))).toBe(UNIQUE);
    const other = await insertRepo(db, scope, await insertInstallation(db, scope), {
      role: "front",
    });
    await insertSnapshot(db, scope, other, commit);
  });

  it("status de snapshot hors énumération refusé", async () => {
    expect(await sqlState(() => insertSnapshot(db, scope, repo, sha(), "half"))).toBe(BAD_ENUM);
  });

  it("le même F-001 existe dans deux snapshots, mais pas deux fois dans un même snapshot", async () => {
    const s1 = await insertSnapshot(db, scope, repo);
    const s2 = await insertSnapshot(db, scope, repo);
    await insertFeature(db, scope, s1, "F-001");
    await insertFeature(db, scope, s2, "F-001");

    expect(await sqlState(() => insertFeature(db, scope, s1, "F-001"))).toBe(UNIQUE);
  });
});

describe("TK-41 C6 index de spec par commit : identifiants uniques par snapshot", () => {
  let scope: Scope;
  let repo: string;
  beforeAll(async () => {
    scope = await insertScope(db, "index");
    repo = await insertRepo(db, scope, await insertInstallation(db, scope), { role: "spec" });
  });

  it("UNIQUE(snapshot_id, spec_id) pour tables et endpoints", async () => {
    const snap = await insertSnapshot(db, scope, repo);
    await insertSpecTable(db, scope, snap, "T-user");
    await insertEndpoint(db, scope, snap, "E-register");

    expect(await sqlState(() => insertSpecTable(db, scope, snap, "T-user"))).toBe(UNIQUE);
    expect(await sqlState(() => insertEndpoint(db, scope, snap, "E-register", "GET"))).toBe(UNIQUE);
  });

  it("UNIQUE(feature_id, spec_id) et UNIQUE(feature_id, position) pour les critères", async () => {
    const feature = await insertFeature(db, scope, await insertSnapshot(db, scope, repo));
    await insertCriterion(db, scope, feature, "AC-1", 1);

    expect(await sqlState(() => insertCriterion(db, scope, feature, "AC-1", 2))).toBe(UNIQUE);
    expect(await sqlState(() => insertCriterion(db, scope, feature, "AC-2", 1))).toBe(UNIQUE);
    await insertCriterion(db, scope, feature, "AC-2", 2);
  });

  it("spec_heads : une seule tête par (repo_id, branch), déplaçable vers un autre snapshot", async () => {
    const r = await insertRepo(db, scope, await insertInstallation(db, scope), { role: "back" });
    const s1 = await insertSnapshot(db, scope, r);
    const s2 = await insertSnapshot(db, scope, r);
    await insertHead(db, scope, r, s1, "main");

    expect(await sqlState(() => insertHead(db, scope, r, s2, "main"))).toBe(UNIQUE);
    await insertHead(db, scope, r, s2, "develop");
    await db.query(
      "UPDATE spec_heads SET snapshot_id = $1 WHERE repo_id = $2 AND branch = 'main'",
      [s2, r],
    );
  });
});

describe("TK-41 C6 index de spec par commit : têtes, formats et énumérations", () => {
  let scope: Scope;
  let repo: string;
  beforeAll(async () => {
    scope = await insertScope(db, "index");
    repo = await insertRepo(db, scope, await insertInstallation(db, scope), { role: "spec" });
  });

  it("formats d'identifiants refusés : F-1, AC-x, T-Upper, E-Bad", async () => {
    const snap = await insertSnapshot(db, scope, repo);
    const feature = await insertFeature(db, scope, snap, "F-002");

    expect(await sqlState(() => insertFeature(db, scope, snap, "F-1"))).toBe(CHECK);
    expect(await sqlState(() => insertCriterion(db, scope, feature, "AC-x", 9))).toBe(CHECK);
    expect(await sqlState(() => insertSpecTable(db, scope, snap, "T-Upper"))).toBe(CHECK);
    expect(await sqlState(() => insertEndpoint(db, scope, snap, "E-Bad_1"))).toBe(CHECK);
  });

  it("method/status/priority hors énumération refusés", async () => {
    const snap = await insertSnapshot(db, scope, repo);

    expect(await sqlState(() => insertEndpoint(db, scope, snap, "E-x", "TRACE"))).toBe(BAD_ENUM);
    expect(
      await sqlState(() =>
        db.query(
          `INSERT INTO spec_features (id, organization_id, snapshot_id, spec_id, title, status,
             priority, file_path, created_at, updated_at)
           VALUES ($1, $2, $3, 'F-900', 't', 'inconnu', 'must', 'f.md', now(), now())`,
          [randomUUID(), scope.organizationId, snap],
        ),
      ),
    ).toBe(BAD_ENUM);
  });

  it("liaison sans doublon (PK composite) ; une cible absente du snapshot est acceptée", async () => {
    const feature = await insertFeature(db, scope, await insertSnapshot(db, scope, repo), "F-003");
    await insertFeatureLink(db, scope, "spec_feature_tables", feature, "T-absente");
    await insertFeatureLink(db, scope, "spec_feature_endpoints", feature, "E-absent");

    expect(
      await sqlState(() =>
        insertFeatureLink(db, scope, "spec_feature_tables", feature, "T-absente"),
      ),
    ).toBe(UNIQUE);
  });
});

describe("TK-41 C6 index de spec par commit : cascades", () => {
  it("supprimer un snapshot supprime features, critères, tables, endpoints, liaisons et têtes", async () => {
    const s = await insertScope(db, "cascade");
    const tree = await insertFullTree(db, s);

    await db.query("DELETE FROM spec_snapshots WHERE id = $1", [tree.snapshotId]);

    for (const table of ["spec_features", "spec_tables", "spec_endpoints", "spec_heads"]) {
      expect(
        await count(`SELECT count(*)::text AS n FROM ${table} WHERE organization_id = $1`, [
          s.organizationId,
        ]),
        table,
      ).toBe(0);
    }
    expect(
      await count("SELECT count(*)::text AS n FROM spec_criteria WHERE feature_id = $1", [
        tree.featureId,
      ]),
    ).toBe(0);
    expect(
      await count("SELECT count(*)::text AS n FROM spec_feature_tables WHERE feature_id = $1", [
        tree.featureId,
      ]),
    ).toBe(0);
    expect(
      await count("SELECT count(*)::text AS n FROM spec_feature_endpoints WHERE feature_id = $1", [
        tree.featureId,
      ]),
    ).toBe(0);
  });
});

describe("TK-41 C6 index de spec par commit : RGPD", () => {
  it("supprimer une organisation efface toutes ses lignes (RGPD §15)", async () => {
    const s = await insertScope(db, "gdpr");
    await insertFullTree(db, s);

    await db.query("DELETE FROM organizations WHERE id = $1", [s.organizationId]);

    for (const table of [
      "provider_installations",
      "project_repos",
      "spec_snapshots",
      "spec_write_batches",
      "spec_write_operations",
    ]) {
      expect(
        await count(`SELECT count(*)::text AS n FROM ${table} WHERE organization_id = $1`, [
          s.organizationId,
        ]),
        table,
      ).toBe(0);
    }
  });
});

describe("TK-41 C7 lots de commits du bot", () => {
  let scope: Scope;
  let repo: string;
  beforeAll(async () => {
    scope = await insertScope(db, "batches");
    repo = await insertRepo(db, scope, await insertInstallation(db, scope), { role: "spec" });
  });

  it("UNIQUE(project_id, idempotency_key) ; la même clé dans un autre projet est acceptée", async () => {
    await insertBatch(db, scope, repo, { idempotencyKey: "req-1" });

    expect(await sqlState(() => insertBatch(db, scope, repo, { idempotencyKey: "req-1" }))).toBe(
      UNIQUE,
    );
    const other = await insertScope(db, "batches-other");
    const otherRepo = await insertRepo(db, other, await insertInstallation(db, other), {
      role: "spec",
    });
    await insertBatch(db, other, otherRepo, { idempotencyKey: "req-1" });
  });

  it("status committed exige commit_sha et committed_at (CHECK)", async () => {
    expect(await sqlState(() => insertBatch(db, scope, repo, { status: "committed" }))).toBe(CHECK);
    expect(
      await sqlState(() => insertBatch(db, scope, repo, { status: "committed", commitSha: sha() })),
    ).toBe(CHECK);
    await insertBatch(db, scope, repo, {
      status: "committed",
      commitSha: sha(),
      committedAt: new Date().toISOString(),
    });
  });

  it("status hors énumération refusé", async () => {
    expect(await sqlState(() => insertBatch(db, scope, repo, { status: "done" }))).toBe(BAD_ENUM);
  });

  it("UNIQUE(repo_id, commit_sha) partiel : deux lots sans SHA coexistent, deux avec le même SHA non", async () => {
    const r = await insertRepo(db, scope, await insertInstallation(db, scope), { role: "back" });
    await insertBatch(db, scope, r);
    await insertBatch(db, scope, r);
    const commit = sha("dup");
    // TK-44a : un SHA n'accompagne plus qu'un lot `committed` (CHECK), le lot est donc validé.
    const committed = {
      commitSha: commit,
      status: "committed",
      committedAt: new Date().toISOString(),
    };
    await insertBatch(db, scope, r, committed);

    expect(await sqlState(() => insertBatch(db, scope, r, committed))).toBe(UNIQUE);
  });
});

describe("TK-41 C7 lots de commits du bot : opérations", () => {
  let scope: Scope;
  let repo: string;
  beforeAll(async () => {
    scope = await insertScope(db, "batches");
    repo = await insertRepo(db, scope, await insertInstallation(db, scope), { role: "spec" });
  });

  it("UNIQUE(batch_id, position) sur les opérations ; kind et payload sont contrôlés", async () => {
    const batch = await insertBatch(db, scope, repo);
    await insertOperation(db, scope, batch, { position: 1 });

    expect(await sqlState(() => insertOperation(db, scope, batch, { position: 1 }))).toBe(UNIQUE);
    expect(
      await sqlState(() => insertOperation(db, scope, batch, { position: 2, kind: "Bad Kind" })),
    ).toBe(CHECK);
    expect(
      await sqlState(() => insertOperation(db, scope, batch, { position: 3, payload: "[]" })),
    ).toBe(CHECK);
    expect(
      await sqlState(() => insertOperation(db, scope, batch, { position: 4, payload: "1" })),
    ).toBe(CHECK);
    expect(
      await sqlState(() => insertOperation(db, scope, batch, { position: 5, payload: "null" })),
    ).toBe(CHECK);
    await insertOperation(db, scope, batch, { position: 6, payload: '{"title":"x"}' });
  });

  it("supprimer un lot supprime ses opérations", async () => {
    const batch = await insertBatch(db, scope, repo);
    await insertOperation(db, scope, batch, { position: 1 });
    await insertOperation(db, scope, batch, { position: 2 });

    await db.query("DELETE FROM spec_write_batches WHERE id = $1", [batch]);

    expect(
      await count("SELECT count(*)::text AS n FROM spec_write_operations WHERE batch_id = $1", [
        batch,
      ]),
    ).toBe(0);
  });

  it("author_user_id n'a pas de FK (utilisateur supprimé conservé dans le lot)", async () => {
    const batch = await insertBatch(db, scope, repo);
    await db.query("UPDATE spec_write_batches SET author_user_id = $1 WHERE id = $2", [
      randomUUID(),
      batch,
    ]);
  });
});

describe("TK-41 C11 index partiels et CHECK présents dans le catalogue", () => {
  it("index partiels : porteur de spec, SHA de lot, file de reprise, rattrapage des webhooks, purge", async () => {
    const rows = await db.query<{ tablename: string; indexdef: string }>(
      `SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public'
       AND tablename IN ('project_repos', 'spec_write_batches', 'webhook_deliveries')`,
    );
    const has = (table: string, pattern: RegExp) =>
      rows.some((r) => r.tablename === table && pattern.test(r.indexdef));

    expect(has("project_repos", /UNIQUE INDEX .*\(project_id\) WHERE/)).toBe(true);
    expect(
      has(
        "spec_write_batches",
        /UNIQUE INDEX .*\(repo_id, commit_sha\) WHERE .*commit_sha IS NOT NULL/,
      ),
    ).toBe(true);
    expect(has("spec_write_batches", /\(repo_id, branch, enqueued_at\) WHERE/)).toBe(true);
    expect(has("webhook_deliveries", /\(status, received_at\) WHERE/)).toBe(true);
    expect(has("webhook_deliveries", /\(received_at\)$/)).toBe(true);
  });

  it("CHECK présents : spec_path, committed, formats d'identifiants, kind", async () => {
    const rows = await db.query<{ relname: string; def: string }>(
      `SELECT cl.relname, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid WHERE con.contype = 'c'
       AND cl.relname IN ('project_repos', 'spec_write_batches', 'spec_features', 'spec_criteria', 'spec_tables', 'spec_endpoints', 'spec_write_operations')`,
    );
    const has = (table: string, pattern: RegExp) =>
      rows.some((r) => r.relname === table && pattern.test(r.def));

    expect(has("project_repos", /spec_path/)).toBe(true);
    expect(has("spec_write_batches", /commit_sha IS NOT NULL/)).toBe(true);
    for (const table of ["spec_features", "spec_criteria", "spec_tables", "spec_endpoints"]) {
      expect(has(table, /spec_id/), `${table} CHECK spec_id`).toBe(true);
    }
    expect(has("spec_write_operations", /kind/)).toBe(true);
  });

  it("FK composite : un repo ne peut pas pointer le projet d'une autre organisation (23503)", async () => {
    const a = await insertScope(db, "fk-a");
    const b = await insertScope(db, "fk-b");
    const installation = await insertInstallation(db, a);

    expect(
      await sqlState(() =>
        insertRepo(db, { organizationId: a.organizationId, projectId: b.projectId }, installation),
      ),
    ).toBe(FOREIGN_KEY);
  });

  it("FK composite : un snapshot ne peut pas pointer le repo d'une autre organisation (23503)", async () => {
    const a = await insertScope(db, "fk-c");
    const b = await insertScope(db, "fk-d");
    const repoB = await insertRepo(db, b, await insertInstallation(db, b), { role: "spec" });

    expect(await sqlState(() => insertSnapshot(db, a, repoB))).toBe(FOREIGN_KEY);
    const snapB = await insertSnapshot(db, b, repoB);
    expect(await sqlState(() => insertFeature(db, a, snapB))).toBe(FOREIGN_KEY);
  });
});
