import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  BASELINE_COLUMNS,
  BASELINE_STATUSES,
  type BaselineOverrides,
  insertBaseline,
  insertReview,
  REVIEW_COLUMNS,
  REVIEW_STATUSES,
  REVIEW_TARGET_KINDS,
  type ReviewOverrides,
  type ReviewScope,
  reviewScope,
  SHA40,
  SHA64,
  secondProject,
  WHEN,
} from "./support/reviews-fixtures.ts";
import { allowedValues } from "./support/spec-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/**
 * TK-51c : contraintes de `reviews` (journal append-only de validations liées au SHA, la dernière
 * fait foi, jamais d'UNIQUE sur cible/SHA/auteur) et de `baselines` (baseline-0, états
 * proposed/validated/tagged imposés par CHECK, au plus une baseline non taguée par projet, FK à
 * trois colonnes vers la review qui valide). Prouvées par SQL direct.
 */
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";
const CHECK = "23514";
const NOT_NULL = "23502";
const INVALID_ENUM = "22P02";
const RESTRICT = "23001";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);

afterAll(async () => {
  await db?.dispose();
}, 60_000);

/** SQLSTATE de l'insertion d'une review dans un projet neuf ; `undefined` si elle réussit. */
const attemptReview = async (label: string, o: ReviewOverrides) =>
  sqlState(async () => insertReview(db, await reviewScope(db, label), o));

/** Idem pour une baseline ; `prepare` crée d'abord une review du même projet si besoin. */
const attemptBaseline = async (
  label: string,
  o: BaselineOverrides | ((scope: ReviewScope, reviewId: string) => BaselineOverrides),
) => {
  const scope = await reviewScope(db, label);
  const reviewId = await insertReview(db, scope, {
    targetKind: "baseline",
    targetRef: "baseline-0",
  });
  return sqlState(() =>
    insertBaseline(db, scope, typeof o === "function" ? o(scope, reviewId) : o),
  );
};

const defs = async (table: string, type: "f" | "c") =>
  (
    await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = '${table}'::regclass AND contype = '${type}' ORDER BY 1`,
    )
  ).map((r) => r.def);

const indexDefs = async (table: string) =>
  (
    await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = '${table}'`,
    )
  ).map((r) => r.indexdef);

const columnsOf = async (table: string) => {
  const rows = await db.query<{ column_name: string; udt_name: string; is_nullable: string }>(
    `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
     WHERE table_name = '${table}' ORDER BY column_name`,
  );
  return Object.fromEntries(rows.map((r) => [r.column_name, `${r.udt_name}/${r.is_nullable}`]));
};

const REVIEW_REQUIRED = ["target_kind", "target_ref", "sha", "status", "author_user_id", "repo_id"];
const BASELINE_REQUIRED = ["number", "status", "proposed_sha", "repo_id"];

/** Insère une review valide dont la seule colonne `column` vaut NULL (jamais d'écart de forme). */
const insertNullReview = (scope: ReviewScope, column: string) => {
  const values: Record<string, string> = {
    repo_id: "$3::uuid",
    target_kind: "'feature'::review_target_kind",
    target_ref: "'F-001'",
    sha: `'${SHA40}'`,
    status: "'approved'::review_status",
    author_user_id: "gen_random_uuid()",
    [column]: "NULL",
  };
  return db.query(
    `INSERT INTO reviews (id, organization_id, project_id, ${Object.keys(values).join(", ")},
       created_at, updated_at)
     SELECT gen_random_uuid(), $1::uuid, $2::uuid, ${Object.values(values).join(", ")}, now(), now()`,
    // Un paramètre non référencé ferait échouer PostgreSQL (08P01) avant la contrainte.
    column === "repo_id"
      ? [scope.organizationId, scope.projectId]
      : [scope.organizationId, scope.projectId, scope.repoId],
  );
};

const insertNullBaseline = (scope: ReviewScope, column: string) => {
  const values: Record<string, string> = {
    repo_id: "$3::uuid",
    number: "0",
    status: "'proposed'::baseline_status",
    proposed_sha: `'${SHA40}'`,
    [column]: "NULL",
  };
  return db.query(
    `INSERT INTO baselines (id, organization_id, project_id, ${Object.keys(values).join(", ")},
       created_at, updated_at)
     SELECT gen_random_uuid(), $1::uuid, $2::uuid, ${Object.values(values).join(", ")}, now(), now()`,
    // Un paramètre non référencé ferait échouer PostgreSQL (08P01) avant la contrainte.
    column === "repo_id"
      ? [scope.organizationId, scope.projectId]
      : [scope.organizationId, scope.projectId, scope.repoId],
  );
};

describe("reviews : structure", () => {
  it("colonnes exactes : types et nullabilité", async () => {
    expect(await columnsOf("reviews")).toEqual(REVIEW_COLUMNS);
  });

  it("aucun défaut sur status et target_kind ; aucune colonne JSON ni tableau", async () => {
    const rows = await db.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
       WHERE table_name = 'reviews' AND column_name IN ('status', 'target_kind', 'sha')`,
    );
    for (const row of rows) expect(row.column_default, row.column_name).toBeNull();
    const exotic = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'reviews' AND (udt_name IN ('json', 'jsonb') OR udt_name LIKE '\\_%')`,
    );
    expect(exotic).toEqual([]);
  });

  it("enums : review_target_kind et review_status ont les valeurs attendues", async () => {
    expect(await allowedValues(db, "reviews", "target_kind")).toEqual(
      [...REVIEW_TARGET_KINDS].sort(),
    );
    expect(await allowedValues(db, "reviews", "status")).toEqual([...REVIEW_STATUSES].sort());
    expect(await attemptReview("enum-status", { status: "rejected" })).toBe(INVALID_ENUM);
    expect(await attemptReview("enum-kind", { targetKind: "ticket" })).toBe(INVALID_ENUM);
  });

  it("index : organization_id, dernière review d'une cible, unique (organization_id, id), unique (organization_id, project_id, id)", async () => {
    const found = await indexDefs("reviews");
    expect(found.some((d) => /^CREATE INDEX .*\(organization_id\)/.test(d))).toBe(true);
    expect(
      found.some((d) =>
        /^CREATE INDEX .*\(project_id, target_kind, target_ref, created_at DESC\)/.test(d),
      ),
    ).toBe(true);
    expect(found.some((d) => /^CREATE UNIQUE INDEX .*\(organization_id, id\)/.test(d))).toBe(true);
    expect(
      found.some((d) => /^CREATE UNIQUE INDEX .*\(organization_id, project_id, id\)/.test(d)),
    ).toBe(true);
  });
});

describe("reviews : journal sans unicité", () => {
  it("aucun UNIQUE hors clé primaire et des deux index composites : journal, la dernière gagne", async () => {
    const unique = (await indexDefs("reviews")).filter((d) => d.startsWith("CREATE UNIQUE"));
    // clé primaire + (organization_id, id) + (organization_id, project_id, id)
    expect(unique).toHaveLength(3);
    const scope = await reviewScope(db, "journal");
    const same = { targetRef: "F-001", sha: SHA40, authorUserId: randomUUID() };
    await insertReview(db, scope, { ...same, status: "approved" });
    await insertReview(db, scope, {
      ...same,
      status: "changes_requested",
      comment: "finalement non",
    });
    await insertReview(db, scope, { ...same, status: "approved" });
    const rows = await db.query<{ status: string }>(
      `SELECT status::text AS status FROM reviews WHERE project_id = $1 AND sha = $2 ORDER BY created_at, id`,
      [scope.projectId, SHA40],
    );
    expect(rows).toHaveLength(3);
  });
});

describe("reviews : author_role", () => {
  it("longueur 1 à 64 ou NULL ; vide ou trop long refusé (23514)", async () => {
    expect(await attemptReview("role-null", { authorRole: null })).toBeUndefined();
    expect(await attemptReview("role-64", { authorRole: "r".repeat(64) })).toBeUndefined();
    expect(await attemptReview("role-65", { authorRole: "r".repeat(65) })).toBe(CHECK);
    expect(await attemptReview("role-empty", { authorRole: "" })).toBe(CHECK);
  });
});

describe("reviews : clés étrangères composites et sans FK", () => {
  it("une seule FK : (organization_id, project_id) vers projects, en cascade ; repo_id sans FK", async () => {
    expect(await defs("reviews", "f")).toEqual([
      "FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id) ON DELETE CASCADE",
    ]);
  });

  it("un projet d'une autre organisation est refusé (23503) ; repo_id n'est pas contrôlé en base", async () => {
    const a = await reviewScope(db, "fk-a");
    const b = await reviewScope(db, "fk-b");
    expect(await sqlState(() => insertReview(db, a, { projectId: b.projectId }))).toBe(FOREIGN_KEY);
    // La cohérence repo/projet est vérifiée par l'API (TK-55), pas par une clé étrangère.
    expect(await sqlState(() => insertReview(db, a, { repoId: randomUUID() }))).toBeUndefined();
  });

  it("projet ou organisation inexistants : refusé (23503)", async () => {
    const a = await reviewScope(db, "fk-missing");
    expect(await sqlState(() => insertReview(db, a, { projectId: randomUUID() }))).toBe(
      FOREIGN_KEY,
    );
    expect(await sqlState(() => insertReview(db, a, { organizationId: randomUUID() }))).toBe(
      FOREIGN_KEY,
    );
  });

  it("author_user_id n'a aucune FK (preuve conservée après effacement du compte)", async () => {
    const scope = await reviewScope(db, "no-user-fk");
    await insertReview(db, scope, { authorUserId: randomUUID() });
    const [row] = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_constraint
       WHERE conrelid IN ('reviews'::regclass, 'baselines'::regclass) AND contype = 'f'
         AND pg_get_constraintdef(oid) LIKE '%users%'`,
    );
    expect(row?.n).toBe("0");
  });
});

describe("reviews : formats et bornes", () => {
  it("sha : hexadécimal minuscule de 40 ou 64 caractères", async () => {
    for (const sha of [
      "",
      "abc",
      "a".repeat(39),
      "a".repeat(41),
      "a".repeat(63),
      "A".repeat(40),
      "g".repeat(40),
    ]) {
      expect(await attemptReview(`sha-${sha.length}-${sha[0]}`, { sha }), sha).toBe(CHECK);
    }
    for (const sha of [SHA40, SHA64]) {
      expect(await attemptReview(`sha-ok-${sha.length}`, { sha })).toBeUndefined();
    }
  });

  it("feature : target_ref suit ^F-\\d{3,}$", async () => {
    for (const targetRef of ["F-1", "F-12", "f-001", "F001", "F-0a1", "F-001 ", "baseline-0"]) {
      expect(
        await attemptReview(`f-${targetRef}`, { targetKind: "feature", targetRef }),
        targetRef,
      ).toBe(CHECK);
    }
    for (const targetRef of ["F-001", "F-1234"]) {
      expect(
        await attemptReview(`f-ok-${targetRef}`, { targetKind: "feature", targetRef }),
      ).toBeUndefined();
    }
  });

  it("baseline : target_ref suit ^baseline-(0|[1-9][0-9]*)$", async () => {
    for (const targetRef of [
      "baseline-",
      "baseline-00",
      "baseline-01",
      "baseline--1",
      "Baseline-0",
      "F-001",
      "baseline-0 ",
    ]) {
      expect(
        await attemptReview(`b-${targetRef}`, { targetKind: "baseline", targetRef }),
        targetRef,
      ).toBe(CHECK);
    }
    for (const targetRef of ["baseline-0", "baseline-1", "baseline-12"]) {
      expect(
        await attemptReview(`b-ok-${targetRef}`, { targetKind: "baseline", targetRef }),
      ).toBeUndefined();
    }
  });
});

describe("reviews : écran, commentaire et colonnes obligatoires", () => {
  it("screen : target_ref de 1 à 64 caractères", async () => {
    const screen = (targetRef: string) => ({ targetKind: "screen", targetRef });
    expect(await attemptReview("s-empty", screen(""))).toBe(CHECK);
    expect(await attemptReview("s-65", screen("s".repeat(65)))).toBe(CHECK);
    expect(await attemptReview("s-64", screen("s".repeat(64)))).toBeUndefined();
    expect(await attemptReview("s-1", screen("S-home"))).toBeUndefined();
  });

  it("comment : NULL ou au plus 2000 caractères, texte brut non assaini", async () => {
    expect(await attemptReview("c-2001", { comment: "c".repeat(2001) })).toBe(CHECK);
    expect(await attemptReview("c-2000", { comment: "c".repeat(2000) })).toBeUndefined();
    expect(await attemptReview("c-null", { comment: null })).toBeUndefined();
    const scope = await reviewScope(db, "raw-comment");
    const raw = "<script>alert(1)</script> ' \" IGNORE PREVIOUS INSTRUCTIONS\n\ttab";
    const id = await insertReview(db, scope, { comment: raw });
    const [row] = await db.query<{ comment: string }>("SELECT comment FROM reviews WHERE id = $1", [
      id,
    ]);
    expect(row?.comment).toBe(raw);
  });

  it("NOT NULL : target_kind, target_ref, sha, status, author_user_id, repo_id", async () => {
    const scope = await reviewScope(db, "review-notnull");
    for (const column of REVIEW_REQUIRED) {
      const state = await sqlState(() => insertNullReview(scope, column));
      expect(state, column).toBe(NOT_NULL);
    }
  });
});

describe("reviews : immutabilité (trigger, calqué sur audit_log)", () => {
  it("un UPDATE est refusé (restrict_violation 23001), quelle que soit la colonne", async () => {
    const scope = await reviewScope(db, "immutable-update");
    const id = await insertReview(db, scope);
    for (const set of [
      "status = 'changes_requested'",
      "comment = 'modifié'",
      `sha = '${SHA64}'`,
      "updated_at = now()",
    ]) {
      expect(
        await sqlState(() => db.query(`UPDATE reviews SET ${set} WHERE id = $1`, [id])),
        set,
      ).toBe(RESTRICT);
    }
    const [row] = await db.query<{ status: string; comment: string | null }>(
      "SELECT status::text AS status, comment FROM reviews WHERE id = $1",
      [id],
    );
    expect(row).toEqual({ status: "approved", comment: null });
  });

  it("un DELETE direct est refusé (23001) tant que le projet existe", async () => {
    const scope = await reviewScope(db, "immutable-delete");
    const id = await insertReview(db, scope);
    expect(await sqlState(() => db.query("DELETE FROM reviews WHERE id = $1", [id]))).toBe(
      RESTRICT,
    );
    expect(
      await sqlState(() =>
        db.query("DELETE FROM reviews WHERE project_id = $1", [scope.projectId]),
      ),
    ).toBe(RESTRICT);
    expect(await db.query("SELECT 1 FROM reviews WHERE id = $1", [id])).toHaveLength(1);
  });

  it("TRUNCATE est refusé (23001) ; les lignes restent", async () => {
    const scope = await reviewScope(db, "immutable-truncate");
    const id = await insertReview(db, scope);
    // `baselines` est tronquée avec `reviews` : sinon PostgreSQL refuse avant le trigger (FK entrante).
    expect(await sqlState(() => db.query("TRUNCATE reviews, baselines"))).toBe(RESTRICT);
    expect(await db.query("SELECT 1 FROM reviews WHERE id = $1", [id])).toHaveLength(1);
  });

  it("les INSERT restent libres : un journal ne fait que grandir", async () => {
    const scope = await reviewScope(db, "append");
    for (let i = 0; i < 3; i++) await insertReview(db, scope, { sha: SHA40 });
    const [row] = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM reviews WHERE project_id = $1",
      [scope.projectId],
    );
    expect(row?.n).toBe("3");
  });
});

describe("baselines : structure", () => {
  it("colonnes exactes : types et nullabilité ; status vaut 'proposed' par défaut", async () => {
    expect(await columnsOf("baselines")).toEqual(BASELINE_COLUMNS);
    const [row] = await db.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'baselines' AND column_name = 'status'`,
    );
    expect(row?.column_default).toContain("proposed");
  });

  it("enum baseline_status : proposed, validated, tagged", async () => {
    expect(await allowedValues(db, "baselines", "status")).toEqual([...BASELINE_STATUSES].sort());
    expect(await attemptBaseline("enum", { status: "done" })).toBe(INVALID_ENUM);
  });

  it("index : organization_id, unique (project_id, number), unique (organization_id, id), unique partiel hors tagged", async () => {
    const found = await indexDefs("baselines");
    expect(found.some((d) => /^CREATE INDEX .*\(organization_id\)/.test(d))).toBe(true);
    expect(found.some((d) => /^CREATE UNIQUE INDEX .*\(project_id, number\)/.test(d))).toBe(true);
    expect(found.some((d) => /^CREATE UNIQUE INDEX .*\(organization_id, id\)/.test(d))).toBe(true);
    expect(
      found.some((d) =>
        /^CREATE UNIQUE INDEX .*\(project_id\) WHERE \(status <> 'tagged'::baseline_status\)/.test(
          d,
        ),
      ),
    ).toBe(true);
  });

  it("FK : projet en cascade, review par trois colonnes en NO ACTION ; repo_id sans FK", async () => {
    expect(await defs("baselines", "f")).toEqual(
      [
        "FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id) ON DELETE CASCADE",
        "FOREIGN KEY (organization_id, project_id, review_id) REFERENCES reviews(organization_id, project_id, id)",
      ].sort(),
    );
  });
});

describe("baselines : numéro et unicité", () => {
  it("number >= 0 : 0 (fin du cadrage) accepté, -1 refusé", async () => {
    expect(await attemptBaseline("n-0", { number: 0 })).toBeUndefined();
    expect(await attemptBaseline("n-1", { number: 1 })).toBeUndefined();
    expect(await attemptBaseline("n-neg", { number: -1 })).toBe(CHECK);
  });

  it("UNIQUE (project_id, number) ; deux projets peuvent chacun avoir la baseline 0", async () => {
    const b = await reviewScope(db, "num-b");
    const first = await reviewScope(db, "num-first");
    await insertBaseline(db, first, { number: 0 });
    expect(await sqlState(() => insertBaseline(db, first, { number: 0 }))).toBe(UNIQUE);
    await insertBaseline(db, b, { number: 0 });
    const second = await secondProject(db, first);
    await insertBaseline(db, second, { number: 0 });
  });

  it("proposed_sha et tag_sha : hexadécimal minuscule de 40 ou 64 caractères", async () => {
    for (const proposedSha of ["", "abc", "a".repeat(41), "A".repeat(40), "g".repeat(40)]) {
      expect(
        await attemptBaseline(`psha-${proposedSha.length}-${proposedSha[0]}`, { proposedSha }),
        proposedSha,
      ).toBe(CHECK);
    }
    expect(await attemptBaseline("psha-64", { proposedSha: SHA64 })).toBeUndefined();
    const validated =
      (tagSha: string) =>
      (scope: ReviewScope, reviewId: string): BaselineOverrides => ({
        status: "tagged",
        reviewId,
        validatedAt: WHEN,
        tagSha,
        taggedAt: WHEN,
        repoId: scope.repoId,
      });
    expect(await attemptBaseline("tsha-bad", validated("xyz"))).toBe(CHECK);
    expect(await attemptBaseline("tsha-ok", validated(SHA64))).toBeUndefined();
  });

  it("NOT NULL : number, status, proposed_sha, repo_id", async () => {
    const scope = await reviewScope(db, "baseline-notnull");
    for (const column of BASELINE_REQUIRED) {
      const state = await sqlState(() => insertNullBaseline(scope, column));
      expect(state, column).toBe(NOT_NULL);
    }
  });
});

function taggedFields(): BaselineOverrides {
  return { validatedAt: WHEN, tagSha: SHA40, taggedAt: WHEN };
}

const ok = Symbol("ok");
const table: Array<
  [
    string,
    Partial<Record<"reviewId" | "validatedAt" | "tagSha" | "taggedAt", boolean>>,
    string,
    typeof ok | string,
  ]
> = [
  ["proposed", {}, "proposed nu", ok],
  ["proposed", { reviewId: true }, "proposed avec review", CHECK],
  ["proposed", { validatedAt: true }, "proposed avec validated_at", CHECK],
  ["proposed", { tagSha: true }, "proposed avec tag_sha", CHECK],
  ["proposed", { taggedAt: true }, "proposed avec tagged_at", CHECK],
  ["validated", { reviewId: true, validatedAt: true }, "validated complet", ok],
  ["validated", { validatedAt: true }, "validated sans review", CHECK],
  ["validated", { reviewId: true }, "validated sans validated_at", CHECK],
  [
    "validated",
    { reviewId: true, validatedAt: true, tagSha: true },
    "validated avec tag_sha",
    CHECK,
  ],
  [
    "validated",
    { reviewId: true, validatedAt: true, taggedAt: true },
    "validated avec tagged_at",
    CHECK,
  ],
  [
    "tagged",
    { reviewId: true, validatedAt: true, tagSha: true, taggedAt: true },
    "tagged complet",
    ok,
  ],
  ["tagged", { validatedAt: true, tagSha: true, taggedAt: true }, "tagged sans review", CHECK],
  ["tagged", { reviewId: true, tagSha: true, taggedAt: true }, "tagged sans validated_at", CHECK],
  ["tagged", { reviewId: true, validatedAt: true, taggedAt: true }, "tagged sans tag_sha", CHECK],
  ["tagged", { reviewId: true, validatedAt: true, tagSha: true }, "tagged sans tagged_at", CHECK],
];

describe("baselines : états imposés par CHECK", () => {
  it.each(table)("%s : %s", async (status, present, label, expected) => {
    const outcome = await attemptBaseline(`state-${label}`, (_scope, reviewId) => ({
      status,
      reviewId: present.reviewId ? reviewId : null,
      validatedAt: present.validatedAt ? WHEN : null,
      tagSha: present.tagSha ? SHA40 : null,
      taggedAt: present.taggedAt ? WHEN : null,
    }));
    expect(outcome).toBe(expected === ok ? undefined : expected);
  });

  it("UPDATE : proposed -> validated exige la review ; la transition complète est acceptée", async () => {
    const scope = await reviewScope(db, "transition");
    const id = await insertBaseline(db, scope, { number: 0 });
    const reviewId = await insertReview(db, scope, {
      targetKind: "baseline",
      targetRef: "baseline-0",
    });
    expect(
      await sqlState(() =>
        db.query("UPDATE baselines SET status = 'validated' WHERE id = $1", [id]),
      ),
    ).toBe(CHECK);
    await db.query(
      "UPDATE baselines SET status = 'validated', review_id = $2, validated_at = now() WHERE id = $1",
      [id, reviewId],
    );
    await db.query(
      "UPDATE baselines SET status = 'tagged', tag_sha = $2, tagged_at = now() WHERE id = $1",
      [id, SHA64],
    );
    expect(
      await sqlState(() =>
        db.query("UPDATE baselines SET status = 'proposed' WHERE id = $1", [id]),
      ),
    ).toBe(CHECK);
  });
});

describe("baselines : au plus une baseline non taguée par projet", () => {
  const tagged = (reviewId: string, number: number): BaselineOverrides => ({
    number,
    status: "tagged",
    reviewId,
    ...taggedFields(),
  });

  it("une deuxième baseline proposed ou validated dans le projet est refusée (23505)", async () => {
    const scope = await reviewScope(db, "one-open");
    const review = await insertReview(db, scope, {
      targetKind: "baseline",
      targetRef: "baseline-0",
    });
    await insertBaseline(db, scope, { number: 0 });
    expect(await sqlState(() => insertBaseline(db, scope, { number: 1 }))).toBe(UNIQUE);
    expect(
      await sqlState(() =>
        insertBaseline(db, scope, {
          number: 2,
          status: "validated",
          reviewId: review,
          validatedAt: WHEN,
        }),
      ),
    ).toBe(UNIQUE);
  });

  it("des baselines taguées s'accumulent, puis une nouvelle proposition est possible", async () => {
    const scope = await reviewScope(db, "many-tagged");
    const review = await insertReview(db, scope, {
      targetKind: "baseline",
      targetRef: "baseline-0",
    });
    await insertBaseline(db, scope, tagged(review, 0));
    await insertBaseline(db, scope, tagged(review, 1));
    await insertBaseline(db, scope, tagged(review, 2));
    await insertBaseline(db, scope, { number: 3 });
    expect(await sqlState(() => insertBaseline(db, scope, { number: 4 }))).toBe(UNIQUE);
  });
});

describe("baselines : libérer et isoler la place en cours", () => {
  it("taguer la baseline en cours libère la place", async () => {
    const scope = await reviewScope(db, "free-slot");
    const review = await insertReview(db, scope, {
      targetKind: "baseline",
      targetRef: "baseline-0",
    });
    const id = await insertBaseline(db, scope, { number: 0 });
    await db.query(
      "UPDATE baselines SET status = 'tagged', review_id = $2, validated_at = now(), tag_sha = $3, tagged_at = now() WHERE id = $1",
      [id, review, SHA40],
    );
    await insertBaseline(db, scope, { number: 1 });
  });

  it("la règle est par projet : deux projets de la même organisation ont chacun une baseline en cours", async () => {
    const scope = await reviewScope(db, "per-project");
    const other = await secondProject(db, scope);
    await insertBaseline(db, scope, { number: 0 });
    await insertBaseline(db, other, { number: 0 });
  });
});

describe("baselines : FK à trois colonnes vers la review", () => {
  it("une review d'un autre projet de la même organisation est refusée (23503)", async () => {
    const scope = await reviewScope(db, "fk3-project");
    const other = await secondProject(db, scope);
    const foreignReview = await insertReview(db, other, {
      targetKind: "baseline",
      targetRef: "baseline-0",
    });
    const outcome = await sqlState(() =>
      insertBaseline(db, scope, {
        status: "validated",
        reviewId: foreignReview,
        validatedAt: WHEN,
      }),
    );
    expect(outcome).toBe(FOREIGN_KEY);
  });

  it("une review d'une autre organisation ou inexistante est refusée (23503)", async () => {
    const a = await reviewScope(db, "fk3-a");
    const b = await reviewScope(db, "fk3-b");
    const foreign = await insertReview(db, b, { targetKind: "baseline", targetRef: "baseline-0" });
    const validated = (reviewId: string): BaselineOverrides => ({
      status: "validated",
      reviewId,
      validatedAt: WHEN,
    });
    expect(await sqlState(() => insertBaseline(db, a, validated(foreign)))).toBe(FOREIGN_KEY);
    expect(await sqlState(() => insertBaseline(db, a, validated(randomUUID())))).toBe(FOREIGN_KEY);
  });

  it("un projet d'une autre organisation est refusé (23503)", async () => {
    const a = await reviewScope(db, "fk-base-a");
    const b = await reviewScope(db, "fk-base-b");
    expect(await sqlState(() => insertBaseline(db, a, { projectId: b.projectId }))).toBe(
      FOREIGN_KEY,
    );
  });

  it("supprimer directement la review qui valide est impossible (immutabilité, puis NO ACTION)", async () => {
    const scope = await reviewScope(db, "fk3-delete");
    const review = await insertReview(db, scope, {
      targetKind: "baseline",
      targetRef: "baseline-0",
    });
    await insertBaseline(db, scope, { status: "validated", reviewId: review, validatedAt: WHEN });
    expect(await sqlState(() => db.query("DELETE FROM reviews WHERE id = $1", [review]))).toBe(
      RESTRICT,
    );
  });
});

const count = async (table: string, column: string, value: string) =>
  Number(
    (
      await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${table} WHERE ${column} = $1`,
        [value],
      )
    )[0]?.n,
  );

async function seedValidated(label: string) {
  const scope = await reviewScope(db, label);
  const review = await insertReview(db, scope, {
    targetKind: "baseline",
    targetRef: "baseline-0",
  });
  await insertReview(db, scope, { status: "changes_requested", comment: "à revoir" });
  await insertBaseline(db, scope, {
    number: 0,
    status: "validated",
    reviewId: review,
    validatedAt: WHEN,
  });
  return scope;
}

describe("cascade à la suppression : reviews immuables, baselines NO ACTION", () => {
  it("supprimer le projet supprime reviews et baselines, sans erreur (trigger et NO ACTION)", async () => {
    const a = await seedValidated("cascade-project-a");
    const b = await seedValidated("cascade-project-b");
    await db.query("DELETE FROM projects WHERE id = $1", [a.projectId]);
    expect(await count("reviews", "project_id", a.projectId)).toBe(0);
    expect(await count("baselines", "project_id", a.projectId)).toBe(0);
    expect(await count("reviews", "project_id", b.projectId)).toBe(2);
    expect(await count("baselines", "project_id", b.projectId)).toBe(1);
  });

  it("supprimer l'organisation supprime reviews et baselines de tous ses projets", async () => {
    const a = await seedValidated("cascade-org-a");
    const a2 = await secondProject(db, a);
    await insertReview(db, a2);
    const b = await seedValidated("cascade-org-b");
    await db.query("DELETE FROM organizations WHERE id = $1", [a.organizationId]);
    expect(await count("reviews", "organization_id", a.organizationId)).toBe(0);
    expect(await count("baselines", "organization_id", a.organizationId)).toBe(0);
    expect(await count("reviews", "organization_id", b.organizationId)).toBe(2);
  });
});

describe("cascade à la suppression : repo, voisins et auteur", () => {
  it("supprimer le repo ne supprime ni les reviews ni les baselines (preuves liées au SHA)", async () => {
    const scope = await seedValidated("cascade-repo");
    await db.query("DELETE FROM project_repos WHERE id = $1", [scope.repoId]);
    expect(await count("reviews", "repo_id", scope.repoId)).toBe(2);
    expect(await count("baselines", "repo_id", scope.repoId)).toBe(1);
    expect(await count("projects", "id", scope.projectId)).toBe(1);
    // Le journal reste protégé : le repo disparu n'ouvre aucune exception de suppression.
    expect(
      await sqlState(() =>
        db.query("DELETE FROM reviews WHERE project_id = $1", [scope.projectId]),
      ),
    ).toBe(RESTRICT);
  });

  it("supprimer l'installation (cascade vers les repos) conserve reviews et baselines", async () => {
    const scope = await seedValidated("cascade-installation");
    await db.query("DELETE FROM provider_installations WHERE id = $1", [scope.installationId]);
    expect(await count("project_repos", "id", scope.repoId)).toBe(0);
    expect(await count("reviews", "project_id", scope.projectId)).toBe(2);
    expect(await count("baselines", "project_id", scope.projectId)).toBe(1);
  });

  it("supprimer le projet d'un repo secondaire ne touche pas les autres projets de l'organisation", async () => {
    const a = await seedValidated("cascade-sibling");
    const sibling = await secondProject(db, a);
    await insertReview(db, sibling);
    await db.query("DELETE FROM projects WHERE id = $1", [a.projectId]);
    expect(await count("reviews", "project_id", sibling.projectId)).toBe(1);
  });

  it("l'effacement d'un auteur n'efface rien (aucune FK)", async () => {
    const scope = await reviewScope(db, "author-erased");
    const author = randomUUID();
    await db.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Auteur', $2, true, now(), now())`,
      [author, `${author}@example.test`],
    );
    const id = await insertReview(db, scope, { authorUserId: author });
    await db.query("DELETE FROM users WHERE id = $1", [author]);
    const [row] = await db.query<{ author_user_id: string }>(
      "SELECT author_user_id FROM reviews WHERE id = $1",
      [id],
    );
    expect(row?.author_user_id).toBe(author);
  });
});
