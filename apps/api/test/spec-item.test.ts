import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { insertItems, itemApi } from "./helpers/spec-items.ts";
import { type FeatureSeed, readScene, seedIndex, specReadApi } from "./helpers/spec-read.ts";

/**
 * TK-101 lot A (B329 b, c, contrat 2.11.0) : `spec.item.get`. Les valeurs de la fiche (comme `spec.getFeature`), l'état
 * « validé » du Fonctionnel et les éléments qui citent F-nnn (jeton exact : F-0031 ne cite pas F-003).
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

const F003: FeatureSeed = {
  id: "F-003",
  titre: "Annuler une réservation",
  statut: "specifiee",
  priorite: "must",
  description: "Annuler depuis l'espace client.",
  criteres: [
    {
      titre: "Annulation",
      etapes: [
        { type: "etant_donne", texte: "une réservation" },
        { type: "quand", texte: "j'annule" },
        { type: "alors", texte: "elle est annulée" },
      ],
    },
  ],
  regles: ["R-001"],
};

async function scene() {
  const s = await readScene(bench());
  const seeded = await seedIndex(bench(), s, [F003], { commit: true });
  return { s, ...seeded };
}
const getOf = (
  s: Awaited<ReturnType<typeof readScene>>,
  id = "F-003",
  role: "dev" | "client" | "business" = "dev",
) => itemApi(bench().app, s.world.actors[role]).get(s.projectId, id);

async function approveFunctional(s: Awaited<ReturnType<typeof readScene>>, sha: string) {
  await bench().database.query(
    `INSERT INTO reviews (id, organization_id, project_id, repo_id, target_kind, target_ref, sha, status,
                          author_user_id, author_role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'deliverable', 'functional', $5, 'approved', $6, 'owner', now(), now())`,
    [randomUUID(), s.organizationId, s.projectId, s.repoId, sha, s.world.actors.owner.userId],
  );
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.item.get", () => {
  it("rend les valeurs de la fiche, identiques à spec.getFeature ; validated faux, aucune référence", async () => {
    const { s } = await scene();

    const res = await getOf(s);
    const feature = await specReadApi(bench().app, s.world.actors.dev).get(s.projectId, "F-003");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(feature.status).toBe(200);
    expect(res.body).toEqual({
      type: "feature",
      id: "F-003",
      values: feature.body,
      validated: false,
      referencedBy: { items: [], total: 0 },
    });
  });

  it("validated vrai quand le livrable Fonctionnel est validé sur le contenu courant, faux sinon", async () => {
    const { s, sha } = await scene();
    expect((await getOf(s)).body.validated).toBe(false);

    await approveFunctional(s, sha);

    expect((await getOf(s)).body.validated).toBe(true);
  });

  it("referencedBy : la règle et le parcours qui citent F-003 ; jeton exact (F-0031 et AF-003 ne comptent pas)", async () => {
    const { s, snapshotId } = await scene();
    await insertItems(bench().database, s, snapshotId, [
      {
        kind: "feature",
        specId: "F-003",
        data: { titre: "Annuler une réservation", description: "F-003" },
        sort: 1,
      },
      {
        kind: "rule",
        specId: "R-001",
        data: { titre: "Délai d'annulation", texte: "Voir F-003." },
        sort: 1,
      },
      {
        kind: "flow",
        specId: "P-001",
        data: { titre: "Parcours client", etapes: ["F-001", "F-003"] },
        sort: 1,
      },
      {
        kind: "rule",
        specId: "R-002",
        data: { titre: "Autre", texte: "Voir F-0031 et AF-003." },
        sort: 2,
      },
    ]);

    const { body } = await getOf(s);

    expect(body.referencedBy.total).toBe(2);
    expect(body.referencedBy.items).toEqual([
      { kind: "flow", specId: "P-001", title: "Parcours client" },
      { kind: "rule", specId: "R-001", title: "Délai d'annulation" },
    ]);
  });

  it("referencedBy : 20 éléments au plus, le total les compte tous", async () => {
    const { s, snapshotId } = await scene();
    await insertItems(
      bench().database,
      s,
      snapshotId,
      Array.from({ length: 25 }, (_, n) => ({
        kind: "rule" as const,
        specId: `R-${String(n + 1).padStart(3, "0")}`,
        data: { titre: `Règle ${n + 1}`, texte: "Cite F-003" },
        sort: n + 1,
      })),
    );
    const { body } = await getOf(s);
    expect(body.referencedBy.items).toHaveLength(20);
    expect(body.referencedBy.total).toBe(25);
  });

  it("client et business : 403 ; autre organisation : 404 ; fonctionnalité inconnue : 404 ; type ou id invalide : 400", async () => {
    const { s } = await scene();
    for (const role of ["client", "business"] as const) {
      expect((await getOf(s, "F-003", role)).status, role).toBe(403);
    }
    const other = await readScene(bench());
    const foreign = await itemApi(bench().app, other.world.actors.dev).get(s.projectId, "F-003");
    expect(foreign.status).toBe(404);
    expect((await getOf(s, "F-999")).status).toBe(404);
    const api = itemApi(bench().app, s.world.actors.dev);
    expect((await api.get(s.projectId, "F-003", "rule")).status).toBe(400);
    expect((await api.get(s.projectId, "zzz")).status).toBe(400);
  });
});
