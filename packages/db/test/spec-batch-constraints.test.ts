import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { insertInstallation, insertOperation, insertRepo, sha } from "./support/spec-fixtures.ts";
import { insertScope, type Scope, sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-44a : colonnes et contraintes ajoutées à `spec_write_batches` pour l'écriture de spec par
 * lots (report, message, author_role), valeur `feature` du compteur, cohérence statut / SHA /
 * code d'erreur / rapport, position de base 1. Fichier séparé de `spec-index-constraints.test.ts`
 * (déjà au-delà de 300 lignes).
 */
const CHECK = "23514";
const BAD_ENUM = "22P02";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

type BatchInput = {
  status?: string;
  commitSha?: string | null;
  committedAt?: string | null;
  errorCode?: string | null;
  /** Texte JSON inséré tel quel (`null` : colonne SQL NULL). */
  report?: string | null;
  message?: string | null;
  authorRole?: string | null;
};

async function insertBatch(scope: Scope, repoId: string, o: BatchInput = {}): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO spec_write_batches (id, organization_id, project_id, repo_id, branch,
       idempotency_key, commit_sha, status, error_code, report, message, author_role,
       enqueued_at, committed_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'cadrage', $5, $6, $7, $8, $9::jsonb, $10, $11, now(), $12::timestamptz, now(), now())`,
    [
      id,
      scope.organizationId,
      scope.projectId,
      repoId,
      randomUUID(),
      o.commitSha ?? null,
      o.status ?? "queued",
      o.errorCode ?? null,
      o.report ?? null,
      o.message ?? null,
      o.authorRole ?? null,
      o.committedAt ?? null,
    ],
  );
  return id;
}

const committed = (): BatchInput => ({
  status: "committed",
  commitSha: sha(),
  committedAt: new Date().toISOString(),
});

let scope: Scope;
let repo: string;
beforeAll(async () => {
  scope = await insertScope(db, "batch-outcome");
  repo = await insertRepo(db, scope, await insertInstallation(db, scope), { role: "spec" });
});

describe("TK-44a colonnes report, message, author_role", () => {
  it("report est jsonb, message et author_role sont text, tous trois nullables, sans valeur par défaut", async () => {
    const rows = await db.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'spec_write_batches'
         AND column_name IN ('report', 'message', 'author_role') ORDER BY column_name`,
    );

    expect(rows).toEqual([
      { column_name: "author_role", data_type: "text", is_nullable: "YES", column_default: null },
      { column_name: "message", data_type: "text", is_nullable: "YES", column_default: null },
      { column_name: "report", data_type: "jsonb", is_nullable: "YES", column_default: null },
    ]);
  });

  it("un lot validé conserve rapport (avertissements), message sur plusieurs lignes et rôle de l'auteur", async () => {
    const report = { issues: [{ code: "R7_ORPHAN_TABLE", severity: "warning" }], truncated: false };
    const message = "spec: créé F-004\n\nCo-authored-by: Ada <ada@example.org>";
    const id = await insertBatch(scope, repo, {
      ...committed(),
      report: JSON.stringify(report),
      message,
      authorRole: "dev",
    });

    const [row] = await db.query<{ report: unknown; message: string; author_role: string }>(
      "SELECT report, message, author_role FROM spec_write_batches WHERE id = $1",
      [id],
    );

    expect(row).toEqual({ report, message, author_role: "dev" });
  });

  it("un lot en file n'a ni rapport, ni message, ni rôle obligatoires", async () => {
    const id = await insertBatch(scope, repo);

    const [row] = await db.query<{ report: unknown; message: unknown; author_role: unknown }>(
      "SELECT report, message, author_role FROM spec_write_batches WHERE id = $1",
      [id],
    );

    expect(row).toEqual({ report: null, message: null, author_role: null });
  });

  it("report doit être un objet JSON : tableau, chaîne, nombre et null JSON sont refusés", async () => {
    for (const report of ["[]", '"texte"', "12", "null"]) {
      expect(
        await sqlState(() =>
          insertBatch(scope, repo, { status: "failed", errorCode: "SPEC_INVALID", report }),
        ),
        report,
      ).toBe(CHECK);
    }
    await insertBatch(scope, repo, { status: "failed", errorCode: "SPEC_INVALID", report: "{}" });
  });
});

describe("TK-44a statut, SHA et code d'erreur", () => {
  it("failed et conflict exigent un code d'erreur", async () => {
    for (const status of ["failed", "conflict"]) {
      expect(await sqlState(() => insertBatch(scope, repo, { status })), status).toBe(CHECK);
    }
    await insertBatch(scope, repo, { status: "failed", errorCode: "SPEC_INVALID", report: "{}" });
    await insertBatch(scope, repo, { status: "failed", errorCode: "PROVIDER_UNAVAILABLE" });
    await insertBatch(scope, repo, { status: "conflict", errorCode: "stale_base" });
    await insertBatch(scope, repo, { status: "conflict", errorCode: "write_conflict" });
  });

  it("queued, committing et committed n'exigent pas de code d'erreur", async () => {
    await insertBatch(scope, repo, { status: "queued" });
    await insertBatch(scope, repo, { status: "committing" });
    await insertBatch(scope, repo, committed());
  });

  it("un SHA de commit n'accompagne qu'un lot committed", async () => {
    const withSha = { commitSha: sha() };
    for (const extra of [
      { status: "queued" },
      { status: "committing" },
      { status: "failed", errorCode: "INTERNAL" },
      { status: "conflict", errorCode: "write_conflict" },
    ]) {
      expect(
        await sqlState(() => insertBatch(scope, repo, { ...extra, ...withSha })),
        extra.status,
      ).toBe(CHECK);
    }
  });

  it("un lot committed sans SHA ou sans date reste refusé (contrainte existante conservée)", async () => {
    expect(await sqlState(() => insertBatch(scope, repo, { status: "committed" }))).toBe(CHECK);
    expect(
      await sqlState(() => insertBatch(scope, repo, { status: "committed", commitSha: sha() })),
    ).toBe(CHECK);
  });

  it("les transitions du worker restent possibles : committing -> committed, queued -> failed", async () => {
    const running = await insertBatch(scope, repo, { status: "committing" });
    await db.query(
      "UPDATE spec_write_batches SET status = 'committed', commit_sha = $2, committed_at = now() WHERE id = $1",
      [running, sha()],
    );
    const refused = await insertBatch(scope, repo);
    await db.query(
      "UPDATE spec_write_batches SET status = 'failed', error_code = 'SPEC_INVALID', report = $2::jsonb WHERE id = $1",
      [refused, JSON.stringify({ issues: [], truncated: false })],
    );
    expect(
      await sqlState(() =>
        db.query("UPDATE spec_write_batches SET status = 'failed' WHERE id = $1", [running]),
      ),
    ).toBe(CHECK);
  });
});

describe("TK-44a compteur de features", () => {
  it("counter_name accepte feature après ticket et sprint, dans cet ordre", async () => {
    const labels = await db.query<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'counter_name' ORDER BY e.enumsortorder`,
    );

    expect(labels.map((l) => l.enumlabel)).toEqual(["ticket", "sprint", "feature"]);
  });

  it("un compteur `feature` par projet s'incrémente comme ticket et sprint", async () => {
    const s = await insertScope(db, "feature-counter");
    for (const name of ["ticket", "sprint", "feature"]) {
      await db.query(
        `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
         VALUES ($1, $2, $3, 0, now(), now())`,
        [s.organizationId, s.projectId, name],
      );
    }

    const rows = await db.query<{ last_value: number }>(
      `UPDATE project_counters SET last_value = last_value + 1, updated_at = now()
       WHERE project_id = $1 AND name = 'feature' RETURNING last_value`,
      [s.projectId],
    );

    expect(rows).toEqual([{ last_value: 1 }]);
    const [others] = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM project_counters WHERE project_id = $1 AND name <> 'feature' AND last_value = 0",
      [s.projectId],
    );
    expect(others?.n).toBe("2");
  });

  it("un deuxième compteur feature pour le même projet est refusé (clé primaire)", async () => {
    const s = await insertScope(db, "feature-counter-dup");
    const insert = () =>
      db.query(
        `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
         VALUES ($1, $2, 'feature', 0, now(), now())`,
        [s.organizationId, s.projectId],
      );
    await insert();

    expect(await sqlState(insert)).toBe("23505");
  });

  it("une valeur inconnue reste refusée", async () => {
    const s = await insertScope(db, "feature-counter-bad");

    expect(
      await sqlState(() =>
        db.query(
          `INSERT INTO project_counters (organization_id, project_id, name, last_value, created_at, updated_at)
           VALUES ($1, $2, 'epic', 0, now(), now())`,
          [s.organizationId, s.projectId],
        ),
      ),
    ).toBe(BAD_ENUM);
  });
});

describe("TK-44a position des opérations : base 1 en base, base 0 au contrat", () => {
  it("la position 0 est refusée, la position 1 acceptée (le dépôt traduit position - 1)", async () => {
    const batch = await insertBatch(scope, repo);

    expect(await sqlState(() => insertOperation(db, scope, batch, { position: 0 }))).toBe(CHECK);
    expect(await sqlState(() => insertOperation(db, scope, batch, { position: -1 }))).toBe(CHECK);
    await insertOperation(db, scope, batch, { position: 1 });
    await insertOperation(db, scope, batch, { position: 2 });
  });

  it("les positions d'un lot sont uniques", async () => {
    const batch = await insertBatch(scope, repo);
    await insertOperation(db, scope, batch, { position: 1 });

    expect(await sqlState(() => insertOperation(db, scope, batch, { position: 1 }))).toBe("23505");
  });
});
