import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditRowsFull, commentRows, commentsFor, UUID_RE } from "./helpers/comments.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { createReviewScene, P1_FEATURES, type ReviewScene } from "./helpers/reviews.ts";
import { entity, featureEntities, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-109 lot A (B444) : commentaires de table de données. `{ targetKind: "table", targetRef: "T-slug" }` : la ligne porte le
 * projet en `target_id` et la table en `target_ref` ; client, owner, admin, dev et designer commentent, le business non ;
 * seule l'équipe liste ; table inconnue 404 ; `T-slug` mal formé 400 ; aucun commentaire de ticket touché.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
type Role = "owner" | "admin" | "dev" | "designer" | "business";
const p1 = () => scene.p1.projectId;
const as = (role: Role) => commentsFor(bench().app, scene.p1.world.actors[role], p1());
const client = () => commentsFor(bench().app, scene.c1, p1());

beforeEach(async () => {
  scene = await createReviewScene(bench());
  await seedIndex(bench(), scene.p1, P1_FEATURES, {
    commit: true,
    entities: [
      ...featureEntities(P1_FEATURES),
      entity("table", "T-clients", "a", { nom: "Clients" }),
    ],
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("comment.create sur une table", () => {
  it("client : 200, sortie typée table, ligne target_id = projet et target_ref = T-slug", async () => {
    const res = await client().createOnTable("T-clients", "Il manque le téléphone");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      targetKind: "table",
      targetId: p1(),
      targetRef: "T-clients",
      authorKind: "client",
      authorId: scene.c1.userId,
      body: "Il manque le téléphone",
    });
    expect(res.body.id).toMatch(UUID_RE);
    const rows = await commentRows(bench().database, scene.p1.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      target_kind: "table",
      target_id: p1(),
      target_ref: "T-clients",
      deleted_at: null,
    });
  });

  it.each(["owner", "admin", "dev", "designer"] as const)(
    "%s : 200, auteur humain",
    async (role) => {
      const res = await as(role).createOnTable("T-clients");
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.authorKind).toBe("human");
    },
  );

  it("business : 403, rien d'écrit", async () => {
    expect((await as("business").createOnTable("T-clients")).status).toBe(403);
    expect(await commentRows(bench().database, scene.p1.organizationId)).toHaveLength(0);
  });

  it("table inconnue : 404 ; T-slug mal formé ou targetRef absent : 400 ; client d'un autre projet : 404", async () => {
    expect((await client().createOnTable("T-inconnue")).status).toBe(404);
    expect([400, 422]).toContain((await client().createOnTable("T-Mal Forme")).status);
    expect([400, 422]).toContain((await client().createOnTable("clients")).status);
    const withoutRef = await commentsFor(bench().app, scene.c1, p1()).createOnTable(
      "T-clients",
      "x",
      {
        targetRef: undefined,
      },
    );
    expect([400, 422]).toContain(withoutRef.status);
    const other = commentsFor(bench().app, scene.c2, p1());
    expect((await other.createOnTable("T-clients")).status).toBe(404);
    expect(await commentRows(bench().database, scene.p1.organizationId)).toHaveLength(0);
  });

  it("corps vide ou trop long : 400", async () => {
    expect([400, 422]).toContain((await client().createOnTable("T-clients", "")).status);
    expect([400, 422]).toContain(
      (await client().createOnTable("T-clients", "a".repeat(8001))).status,
    );
  });

  it("audit comment.create (cible : le commentaire, sans ticket) et aucun commentaire de ticket touché", async () => {
    const res = await client().createOnTable("T-clients");
    const audit = (await auditRowsFull(bench().database, scene.p1.organizationId)).filter(
      (row) => row.action === "comment.create",
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      target_kind: "comment",
      target_id: res.body.id,
      ticket_id: null,
      project_id: p1(),
      actor_id: scene.c1.userId,
    });
    const tickets = await bench().database.query(
      "SELECT 1 FROM ticket_comments WHERE target_kind = 'ticket' AND organization_id = $1",
      [scene.p1.organizationId],
    );
    expect(tickets).toHaveLength(0);
  });
});

describe("comment.list sur une table", () => {
  it("l'équipe liste du plus ancien au plus récent, limité à la table", async () => {
    await client().createOnTable("T-clients", "premier");
    await as("dev").createOnTable("T-clients", "deuxième");

    const res = await as("owner").listOnTable("T-clients");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items.map((c: { body: string }) => c.body)).toEqual(["premier", "deuxième"]);
    expect(res.body.items[0]).toMatchObject({ targetKind: "table", targetRef: "T-clients" });
    expect(res.body.nextCursor).toBeNull();
  });

  it("le client et le business ne listent pas les commentaires de table (403)", async () => {
    await client().createOnTable("T-clients");
    expect((await client().listOnTable("T-clients")).status).toBe(403);
    expect((await as("business").listOnTable("T-clients")).status).toBe(403);
  });

  it("table inconnue : 404", async () => {
    expect((await as("owner").listOnTable("T-inconnue")).status).toBe(404);
  });
});
