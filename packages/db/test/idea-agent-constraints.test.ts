import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { insertIdeaPage } from "./support/idea-fixtures.ts";
import { insertScope, sqlState } from "./support/ticket-fixtures.ts";

/** TK-90 (lot A) : bornes et cohérences des quatre tables de l'agent, prouvées par SQL direct. */
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

type Scope = Awaited<ReturnType<typeof insertScope>>;

async function message(
  scope: Scope,
  over: { text?: string; author?: string; user?: string | null } = {},
) {
  const id = randomUUID();
  const author = over.author ?? "human";
  await db.query(
    `INSERT INTO idea_messages (id, organization_id, project_id, author_user_id, author, mode, text, updated_at)
     VALUES ($1, $2, $3, $4, $5::idea_message_author, 'interview', $6, now())`,
    [
      id,
      scope.organizationId,
      scope.projectId,
      author === "agent" ? null : over.user === undefined ? randomUUID() : over.user,
      author,
      over.text ?? "Bonjour",
    ],
  );
  return id;
}

interface ProposalOver {
  op?: string;
  pageId?: string | null;
  baseVersion?: number | null;
  title?: string | null;
  contentMd?: string;
  rationale?: string;
  anchor?: number | null;
  rangeEnd?: number | null;
  status?: string;
  messageId?: string;
}

async function proposal(scope: Scope, over: ProposalOver = {}) {
  const op = over.op ?? "append";
  const pageId = over.pageId === undefined ? await insertIdeaPage(db, scope) : over.pageId;
  const messageId = over.messageId ?? (await message(scope, { author: "agent" }));
  await db.query(
    `INSERT INTO idea_proposals (id, organization_id, project_id, page_id, message_id, op, anchor_block_index,
                                 range_end, title, content_md, rationale, base_version, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::idea_proposal_op, $7, $8, $9, $10, $11, $12, $13::idea_proposal_status, now())`,
    [
      randomUUID(),
      scope.organizationId,
      scope.projectId,
      op === "create_page" ? null : pageId,
      messageId,
      op,
      over.anchor ?? null,
      over.rangeEnd ?? null,
      over.title === undefined ? (op === "create_page" ? "Concurrence" : null) : over.title,
      over.contentMd ?? "Texte proposé",
      over.rationale ?? "Parce que",
      over.baseVersion === undefined ? (op === "create_page" ? null : 1) : over.baseVersion,
      over.status ?? "pending",
    ],
  );
}

describe("idea_messages : CHECK et clés", () => {
  it("accepte un message humain et un message de l'agent aux bornes", async () => {
    const scope = await insertScope(db, "msg-ok");
    expect(await sqlState(() => message(scope, { text: "a".repeat(4000) }))).toBeUndefined();
    expect(await sqlState(() => message(scope, { author: "agent", text: "ok" }))).toBeUndefined();
  });

  it.each([
    ["texte vide", { text: "" }],
    ["texte de 4 001 caractères", { text: "a".repeat(4001) }],
    ["message humain sans auteur", { user: null }],
  ])("refuse %s (CHECK)", async (_label, over) => {
    const scope = await insertScope(db, "msg-ko");
    expect(await sqlState(() => message(scope, over))).toBe(CHECK);
  });

  it("refuse un projet inconnu (clé étrangère)", async () => {
    const scope = await insertScope(db, "msg-fk");
    expect(await sqlState(() => message({ ...scope, projectId: randomUUID() }))).toBe(FOREIGN_KEY);
  });
});

describe("idea_proposals : CHECK et clés", () => {
  it.each([
    ["append", {}],
    ["insert_after", { op: "insert_after", anchor: 2 }],
    ["replace", { op: "replace", anchor: 1, rangeEnd: 3 }],
    ["create_page", { op: "create_page" }],
    ["contenu de 50 000 caractères", { contentMd: "a".repeat(50_000) }],
    ["justification de 200 caractères", { rationale: "a".repeat(200) }],
  ])("accepte %s", async (_label, over) => {
    const scope = await insertScope(db, "prop-ok");
    expect(await sqlState(() => proposal(scope, over))).toBeUndefined();
  });

  it.each([
    ["contenu de 50 001 caractères", { contentMd: "a".repeat(50_001) }],
    ["justification de 201 caractères", { rationale: "a".repeat(201) }],
    ["justification vide", { rationale: "" }],
    ["insert_after sans ancre", { op: "insert_after" }],
    ["replace sans ancre", { op: "replace" }],
    ["replace avec fin avant le début", { op: "replace", anchor: 3, rangeEnd: 1 }],
    ["ancre négative", { op: "insert_after", anchor: -1 }],
    ["append avec une ancre", { anchor: 1 }],
    ["create_page sans titre", { op: "create_page", title: null }],
    ["create_page de plus de 120 caractères", { op: "create_page", title: "a".repeat(121) }],
    ["append sans version de base", { baseVersion: null }],
    ["append sans page", { pageId: null }],
    ["create_page avec une version de base", { op: "create_page", baseVersion: 1 }],
    ["version de base nulle", { baseVersion: 0 }],
  ])("refuse %s (CHECK)", async (_label, over) => {
    const scope = await insertScope(db, "prop-ko");
    expect(await sqlState(() => proposal(scope, over))).toBe(CHECK);
  });

  it("refuse un statut inconnu (type énuméré)", async () => {
    const scope = await insertScope(db, "prop-status");
    expect(await sqlState(() => proposal(scope, { status: "maybe" }))).toBe("22P02");
  });

  it("refuse un message inconnu (clé étrangère) et supprime les propositions avec le message", async () => {
    const scope = await insertScope(db, "prop-fk");
    expect(await sqlState(() => proposal(scope, { messageId: randomUUID() }))).toBe(FOREIGN_KEY);
    const messageId = await message(scope, { author: "agent" });
    await proposal(scope, { messageId });
    await db.query("DELETE FROM idea_messages WHERE id = $1", [messageId]);
    const rows = await db.query("SELECT 1 FROM idea_proposals WHERE project_id = $1", [
      scope.projectId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("idea_ai_locks et idea_gap_runs", () => {
  const lock = (scope: Scope, userId: string) =>
    db.query(
      `INSERT INTO idea_ai_locks (organization_id, project_id, user_id, expires_at, updated_at)
       VALUES ($1, $2, $3, now() + interval '120 seconds', now())`,
      [scope.organizationId, scope.projectId, userId],
    );

  it("un seul verrou par (projet, utilisateur)", async () => {
    const scope = await insertScope(db, "lock");
    const user = randomUUID();
    expect(await sqlState(() => lock(scope, user))).toBeUndefined();
    expect(await sqlState(() => lock(scope, user))).toBe(UNIQUE);
    expect(await sqlState(() => lock(scope, randomUUID()))).toBeUndefined();
  });

  it("un seul calcul de manques par projet, dont `items` est un tableau", async () => {
    const scope = await insertScope(db, "gaps");
    const insert = (items: string) =>
      db.query(
        `INSERT INTO idea_gap_runs (id, organization_id, project_id, computed_at, items, updated_at)
         VALUES ($1, $2, $3, now(), $4::jsonb, now())`,
        [randomUUID(), scope.organizationId, scope.projectId, items],
      );
    expect(await sqlState(() => insert("{}"))).toBe(CHECK);
    expect(await sqlState(() => insert("[]"))).toBeUndefined();
    expect(await sqlState(() => insert("[]"))).toBe(UNIQUE);
  });
});
