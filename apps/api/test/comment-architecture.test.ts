import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commentRows, UUID_RE } from "./helpers/comments.ts";
import { commentsOnRef } from "./helpers/comments-architecture.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { createReviewScene, P1_FEATURES, type ReviewScene } from "./helpers/reviews.ts";
import { entity, featureEntities, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-113 lot A (cas 8) : commentaires sur un composant (`C-slug`), une décision (`ADR-nnn`) ou un flux (`P-slug`). La ligne
 * porte le projet en `target_id` et l'élément en `target_ref` ; client, owner, admin, dev et designer commentent, le business
 * non ; seule l'équipe liste ; élément inconnu de la tête : 404 sans rien divulguer ; référence d'un autre genre : 400.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: ReviewScene;
type Role = "owner" | "admin" | "dev" | "designer" | "business";
const p1 = () => scene.p1.projectId;
const as = (role: Role) => commentsOnRef(bench().app, scene.p1.world.actors[role], p1());
const client = () => commentsOnRef(bench().app, scene.c1, p1());

const TARGETS = [
  ["component", "C-api"],
  ["adr", "ADR-001"],
  ["archflow", "P-signup"],
] as const;

beforeEach(async () => {
  scene = await createReviewScene(bench());
  await seedIndex(bench(), scene.p1, P1_FEATURES, {
    commit: true,
    entities: [
      ...featureEntities(P1_FEATURES),
      entity("component", "C-api", "a", { nom: "API", titre: "API" }),
      entity("adr", "ADR-001", "a", { titre: "Monolithe", statut: "acceptee" }),
      entity("archflow", "P-signup", "a", { titre: "P-signup", participants: [] }),
    ],
  });
});

describe.each(TARGETS)("comment.create sur %s %s", (kind, ref) => {
  it("client : 200, sortie typée, ligne target_id = projet et target_ref = identifiant", async () => {
    const res = await client().create(kind, ref, "Pourquoi ce choix ?");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      targetKind: kind,
      targetId: p1(),
      targetRef: ref,
      authorKind: "client",
      authorId: scene.c1.userId,
      body: "Pourquoi ce choix ?",
    });
    expect(res.body.id).toMatch(UUID_RE);
    const rows = await commentRows(bench().database, scene.p1.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      target_kind: kind,
      target_id: p1(),
      target_ref: ref,
      deleted_at: null,
    });
  });

  it.each(["owner", "admin", "dev", "designer"] as const)(
    "%s : 200, auteur humain",
    async (role) => {
      const res = await as(role).create(kind, ref);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.authorKind).toBe("human");
    },
  );

  it("business : 403, rien d'écrit", async () => {
    expect((await as("business").create(kind, ref)).status).toBe(403);
    expect(await commentRows(bench().database, scene.p1.organizationId)).toHaveLength(0);
  });

  it("élément inconnu de la tête : 404 ; client d'un autre projet : 404 ; rien d'écrit", async () => {
    const unknown = ref.replace(/-.*/, "-inconnu").replace("ADR-inconnu", "ADR-999");
    expect((await client().create(kind, unknown)).status).toBe(404);
    const other = commentsOnRef(bench().app, scene.c2, p1());
    expect((await other.create(kind, ref)).status).toBe(404);
    expect(await commentRows(bench().database, scene.p1.organizationId)).toHaveLength(0);
  });

  it("l'équipe liste du plus ancien au plus récent, limité à l'élément ; client et business : 403", async () => {
    await client().create(kind, ref, "premier");
    await as("dev").create(kind, ref, "deuxième");

    const res = await as("owner").list(kind, ref);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items.map((c: { body: string }) => c.body)).toEqual(["premier", "deuxième"]);
    expect(res.body.items[0]).toMatchObject({ targetKind: kind, targetRef: ref });
    expect((await client().list(kind, ref)).status).toBe(403);
    expect((await as("business").list(kind, ref)).status).toBe(403);
  });
});

describe("cible mal formée", () => {
  it("référence d'un autre genre, absente, ou corps vide ou trop long : 400", async () => {
    for (const [kind, ref] of [
      ["component", "ADR-001"],
      ["adr", "C-api"],
      ["archflow", "T-clients"],
      ["component", "api"],
    ] as const) {
      expect([400, 422], `${kind} ${ref}`).toContain((await client().create(kind, ref)).status);
    }
    expect([400, 422]).toContain((await client().create("adr", "ADR-001", "")).status);
    expect([400, 422]).toContain(
      (await client().create("adr", "ADR-001", "a".repeat(8001))).status,
    );
  });

  it("les commentaires de table et de ticket ne se mélangent pas avec ceux de l'architecture", async () => {
    await client().create("component", "C-api", "sur le composant");
    const rows = await commentRows(bench().database, scene.p1.organizationId);
    expect(rows.every((row) => row.target_kind === "component")).toBe(true);
  });
});
