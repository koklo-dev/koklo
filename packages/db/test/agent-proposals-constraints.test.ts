import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { notificationScope } from "./support/notifications-fixtures.ts";
import { secondProject } from "./support/project-client-fixtures.ts";
import { sqlState } from "./support/ticket-fixtures.ts";

/** TK-99a (lot A) : verrou partiel, CHECK, clés composites et isolation de tenant des tables d'agent. */
const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], db.url);
}, 180_000);
afterAll(async () => {
  await db?.dispose();
}, 60_000);

interface Scope {
  organizationId: string;
  projectId: string;
  userId: string;
}

interface LaunchOver {
  deliverable?: string;
  mode?: string;
  instruction?: string | null;
  status?: string;
  errorCode?: string | null;
  proposedCount?: number;
  sources?: string;
  projectId?: string;
  id?: string;
}

const launch = (scope: Scope, over: LaunchOver = {}) =>
  db.query(
    `INSERT INTO agent_launches (id, organization_id, project_id, deliverable, mode, instruction, status,
       error_code, requested_by, sources, proposed_count, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $11::jsonb, $10, now())`,
    [
      over.id ?? randomUUID(),
      scope.organizationId,
      over.projectId ?? scope.projectId,
      over.deliverable ?? "functional",
      over.mode ?? "complete",
      over.instruction === undefined ? null : over.instruction,
      over.status ?? "queued",
      over.errorCode === undefined ? null : over.errorCode,
      scope.userId,
      over.proposedCount ?? 0,
      over.sources ?? '["idea.frozen"]',
    ],
  );

interface ProposalOver {
  launchId: string;
  kind?: string;
  zone?: string;
  position?: number;
  title?: string;
  rationale?: string;
  payload?: string;
  status?: string;
  appliedBatchId?: string | null;
  organizationId?: string;
  id?: string;
}

const proposal = (scope: Scope, over: ProposalOver) =>
  db.query(
    `INSERT INTO agent_proposals (id, organization_id, project_id, launch_id, deliverable, kind, zone, position,
       title, rationale, payload, status, applied_batch_id, updated_at)
     VALUES ($1, $2, $3, $4, 'functional', $5, $6, $7, $8, $9, $10::jsonb, $11, $12, now())`,
    [
      over.id ?? randomUUID(),
      over.organizationId ?? scope.organizationId,
      scope.projectId,
      over.launchId,
      over.kind ?? "feature",
      over.zone ?? "Réservations",
      over.position ?? 0,
      over.title ?? "Annuler une réservation",
      over.rationale ?? "Manque dans le cahier",
      over.payload ?? "{}",
      over.status ?? "pending",
      over.appliedBatchId === undefined ? null : over.appliedBatchId,
    ],
  );

const decision = (scope: Scope, proposalId: string, value = "accept") =>
  db.query(
    `INSERT INTO agent_proposal_decisions (id, organization_id, proposal_id, decision, decided_by)
     VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
    [scope.organizationId, proposalId, value, scope.userId],
  );

const freshLaunch = async (scope: Scope, over: LaunchOver = {}) => {
  const id = randomUUID();
  await launch(scope, { status: "done", ...over, id });
  return id;
};

describe("agent_launches : verrou en base (index unique partiel)", () => {
  it("refuse un second lancement actif du même livrable et du même projet (23505)", async () => {
    const scope = await notificationScope(db, "lock-a");
    await launch(scope, { status: "queued" });
    expect(await sqlState(() => launch(scope, { status: "running" }))).toBe(UNIQUE);
    expect(await sqlState(() => launch(scope, { status: "queued" }))).toBe(UNIQUE);
  });

  it("autorise un autre livrable, un autre projet, et tout nombre de lancements terminés", async () => {
    const scope = await notificationScope(db, "lock-b");
    await launch(scope, { status: "running" });
    expect(
      await sqlState(() => launch(scope, { deliverable: "data", status: "queued" })),
    ).toBeUndefined();
    const other = await secondProject(db, scope, "lock-b2");
    expect(
      await sqlState(() => launch(scope, { projectId: other, status: "queued" })),
    ).toBeUndefined();
    for (const status of ["done", "failed", "canceled", "done"]) {
      expect(await sqlState(() => launch(scope, { status }))).toBeUndefined();
    }
  });

  it("libère le verrou quand le lancement actif se termine", async () => {
    const scope = await notificationScope(db, "lock-c");
    const id = randomUUID();
    await launch(scope, { status: "running", id });
    await db.query(
      "UPDATE agent_launches SET status = 'failed', error_code = 'worker_lost' WHERE id = $1",
      [id],
    );
    expect(await sqlState(() => launch(scope, { status: "queued" }))).toBeUndefined();
  });
});

describe("agent_launches : CHECK", () => {
  it.each([
    ["livrable inconnu", { deliverable: "tout" }],
    ["mode inconnu", { mode: "autre" }],
    ["statut inconnu", { status: "pause" }],
    ["consigne de plus de 500 caractères", { instruction: "x".repeat(501) }],
    ["code d'échec hors d'un échec", { status: "done", errorCode: "worker_lost" }],
    ["code d'échec libre", { status: "failed", errorCode: "Texte Libre Du Fournisseur" }],
    ["compte négatif", { proposedCount: -1 }],
    ["lectures qui ne sont pas une liste", { sources: '{"a":1}' }],
  ])("refuse %s", async (_label, over) => {
    const scope = await notificationScope(db, "launch-check");
    expect(await sqlState(() => launch(scope, over))).toBe(CHECK);
  });

  it("accepte les sept livrables, les quatre modes, une consigne de 500 et un échec typé", async () => {
    const scope = await notificationScope(db, "launch-ok");
    for (const deliverable of [
      "functional",
      "data",
      "architecture",
      "technical",
      "security",
      "design",
      "quality",
    ]) {
      expect(await sqlState(() => launch(scope, { deliverable, status: "done" }))).toBeUndefined();
    }
    for (const mode of ["complete", "criteria", "update", "all"]) {
      expect(await sqlState(() => launch(scope, { mode, status: "done" }))).toBeUndefined();
    }
    expect(
      await sqlState(() => launch(scope, { instruction: "x".repeat(500), status: "done" })),
    ).toBeUndefined();
    expect(
      await sqlState(() => launch(scope, { status: "failed", errorCode: "worker_lost" })),
    ).toBeUndefined();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même table, un test par contrainte
describe("agent_proposals et agent_proposal_decisions : CHECK, clés, cascade", () => {
  it.each([
    ["type inconnu", { kind: "ecran" }],
    ["statut inconnu", { status: "applied" }],
    ["titre vide", { title: "" }],
    ["titre de plus de 200 caractères", { title: "x".repeat(201) }],
    ["zone vide", { zone: "" }],
    ["position négative", { position: -1 }],
    ["charge qui n'est pas un objet", { payload: "[1]" }],
    [
      "lot appliqué sur une proposition en attente",
      { status: "pending", appliedBatchId: randomUUID() },
    ],
    [
      "lot appliqué sur une proposition refusée",
      { status: "rejected", appliedBatchId: randomUUID() },
    ],
  ])("refuse %s", async (_label, over) => {
    const scope = await notificationScope(db, "prop-check");
    const launchId = await freshLaunch(scope);
    expect(await sqlState(() => proposal(scope, { launchId, ...over }))).toBe(CHECK);
  });

  it("accepte les cinq types et un lot appliqué sur une proposition acceptée", async () => {
    const scope = await notificationScope(db, "prop-ok");
    const launchId = await freshLaunch(scope);
    for (const kind of ["feature", "criteria", "rule", "role", "flow"]) {
      expect(await sqlState(() => proposal(scope, { launchId, kind }))).toBeUndefined();
    }
    expect(
      await sqlState(() =>
        proposal(scope, { launchId, status: "accepted", appliedBatchId: randomUUID() }),
      ),
    ).toBeUndefined();
  });

  it("clé composite : un lancement d'une autre organisation ou d'un autre projet est refusé", async () => {
    const a = await notificationScope(db, "prop-fk-a");
    const b = await notificationScope(db, "prop-fk-b");
    const launchOfB = await freshLaunch(b);
    expect(await sqlState(() => proposal(a, { launchId: launchOfB }))).toBe(FOREIGN_KEY);
    expect(await sqlState(() => launch(a, { projectId: b.projectId }))).toBe(FOREIGN_KEY);
  });

  it("journal : décisions acceptées, décision inconnue refusée, proposition d'une autre organisation refusée", async () => {
    const a = await notificationScope(db, "dec-a");
    const b = await notificationScope(db, "dec-b");
    const launchId = await freshLaunch(a);
    const proposalId = randomUUID();
    await proposal(a, { launchId, id: proposalId });
    for (const value of ["accept", "reject", "reset"]) {
      expect(await sqlState(() => decision(a, proposalId, value))).toBeUndefined();
    }
    expect(await sqlState(() => decision(a, proposalId, "annuler"))).toBe(CHECK);
    expect(await sqlState(() => decision(b, proposalId))).toBe(FOREIGN_KEY);
  });

  it("supprimer le projet supprime lancements, propositions et décisions (cascade)", async () => {
    const scope = await notificationScope(db, "cascade");
    const launchId = await freshLaunch(scope);
    const proposalId = randomUUID();
    await proposal(scope, { launchId, id: proposalId });
    await decision(scope, proposalId);
    await db.query("DELETE FROM projects WHERE id = $1", [scope.projectId]);
    for (const table of ["agent_launches", "agent_proposals"]) {
      expect(
        await db.query(`SELECT 1 FROM ${table} WHERE project_id = $1`, [scope.projectId]),
      ).toHaveLength(0);
    }
    expect(
      await db.query("SELECT 1 FROM agent_proposal_decisions WHERE proposal_id = $1", [proposalId]),
    ).toHaveLength(0);
  });
});
