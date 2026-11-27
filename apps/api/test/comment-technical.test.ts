import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commentRows } from "./helpers/comments.ts";
import { commentsOnRef } from "./helpers/comments-architecture.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { createReviewScene, type ReviewScene } from "./helpers/reviews.ts";
import { commitAtHead } from "./helpers/spec-architecture.ts";
import { seedIndex } from "./helpers/spec-read.ts";
import { environmentsEntity, stackEntity } from "./helpers/spec-technical.ts";

/**
 * TK-115 lot B (B732) : commentaires sur un choix technique (`ST-`), sur le bloc des environnements et sur une section du
 * cahier technique (`DOC-`, lue en Git). Le client commente, le business non ; élément inconnu : 404, rien d'écrit.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
const p1 = () => scene.p1.projectId;
const client = () => commentsOnRef(bench().app, scene.c1, p1());
const as = (role: "owner" | "dev" | "designer" | "business") =>
  commentsOnRef(bench().app, scene.p1.world.actors[role], p1());

beforeEach(async () => {
  scene = await createReviewScene(bench());
  const { snapshotId } = await seedIndex(bench(), scene.p1, [], {
    commit: true,
    entities: [stackEntity("ST-sms"), environmentsEntity()],
  });
  await commitAtHead(bench(), scene.p1, snapshotId, [
    { path: "tech/cahier-technique/01-objet.md", content: "# Objet\n\nTexte.\n" },
    { path: "architecture/overview/01-contexte.md", content: "# Contexte\n\nTexte.\n" },
  ]);
});

describe.each([
  ["stack", "ST-sms", "ST-absent"],
  ["environments", "environments", null],
  ["tech_section", "DOC-objet", "DOC-contexte"],
] as const)("commentaire %s", (kind, ref, unknown) => {
  it("client : 200, ligne sur le projet ; l'équipe liste ; le client ne liste pas", async () => {
    const res = await client().create(kind, ref, "Une question.");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ targetKind: kind, targetRef: ref, authorKind: "client" });
    const rows = await commentRows(bench().database, scene.p1.organizationId);
    expect(rows[0]).toMatchObject({ target_kind: kind, target_id: p1(), target_ref: ref });
    const listed = await as("designer").list(kind, ref);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect((await client().list(kind, ref)).status).toBe(403);
  });

  it("business : 403 ; élément inconnu de la tête : 404 ; rien d'écrit", async () => {
    expect((await as("business").create(kind, ref)).status).toBe(403);
    if (unknown !== null) expect((await client().create(kind, unknown)).status).toBe(404);
    expect(await commentRows(bench().database, scene.p1.organizationId)).toHaveLength(0);
  });
});
