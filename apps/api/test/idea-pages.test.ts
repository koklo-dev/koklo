import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene } from "./helpers/client-scene.ts";
import { ideaApi, ideaRows, pageIdOf, seedIdeaTemplate } from "./helpers/idea.ts";

/**
 * TK-89 lot A (T8, T9, T10, T12) : cycle de vie des pages. Base réelle, HTTP réel ; chaque test
 * ouvre son propre projet (3 projets de la scène, p2 et old servent de terrain).
 */
let database: TestDatabase;
let app: INestApplication;
let scene: ClientScene;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
}, 120_000);
afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

let counter = 0;
/** Projet neuf de l'organisation avec ses 10 pages, et l'API de l'owner. */
async function fresh() {
  counter += 1;
  const projectId = randomUUID();
  await database.query(
    "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, $3, now(), now())",
    [projectId, scene.organizationId, `Idée ${counter}`],
  );
  await seedIdeaTemplate(database, { organizationId: scene.organizationId, projectId });
  return { projectId, owner: ideaApi(app, scene.staff.owner) };
}

describe("idea.list", () => {
  it("rend les 10 pages dans l'ordre, sans contenu, avec le total réel et une corbeille vide", async () => {
    const { projectId, owner } = await fresh();
    const res = await owner.list(projectId);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(10);
    expect(res.body.trash).toEqual([]);
    expect(res.body.pages.map((p: { title: string }) => p.title)).toEqual([
      "Vision",
      "Problème",
      "Utilisateurs",
      "Proposition de valeur",
      "Parcours",
      "Périmètre",
      "Contraintes",
      "Mesure",
      "Hypothèses et risques",
      "Glossaire",
    ]);
    expect(res.body.pages.map((p: { position: number }) => p.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(res.body.pages[0]).not.toHaveProperty("contentMd");
    expect(res.body.pages[0].status).toBe("empty");
    expect(res.body.publication).toEqual({ available: false, last: null });
  });

  it("ne livre ni identifiant d'utilisateur ni e-mail", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "vision");
    await owner.save(projectId, id, 1, "Texte");
    const text = JSON.stringify((await owner.list(projectId)).body);
    expect(text).not.toContain(scene.staff.owner.userId);
    expect(text).not.toContain(scene.staff.owner.email);
    expect(text).toContain(scene.staff.owner.name);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("idea.get et idea.save", () => {
  it("get rend la page avec son contenu", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "perimetre");
    const res = await owner.get(projectId, id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      slug: "perimetre",
      contentMd: "",
      version: 1,
      required: true,
    });
  });

  it("save incrémente la version, passe la page vide en brouillon et note l'auteur", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "vision");
    const res = await owner.save(projectId, id, 1, "## Vision\n\nUn texte.");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      version: 2,
      status: "draft",
      contentMd: "## Vision\n\nUn texte.",
    });
    expect(res.body.updatedBy).toEqual({ name: scene.staff.owner.name, isClient: false });
    const [row] = (await ideaRows(database, projectId)).filter((r) => r.id === id);
    expect(row?.updated_by).toBe(scene.staff.owner.userId);
  });

  it("vider le contenu remet la page à vide ; un statut stable est conservé sinon", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "vision");
    await owner.save(projectId, id, 1, "texte");
    await owner.setStatus(projectId, id, "stable");
    expect((await owner.save(projectId, id, 2, "texte 2")).body.status).toBe("stable");
    expect((await owner.save(projectId, id, 3, "  ")).body.status).toBe("empty");
  });

  it("T10 : une version périmée rend CONFLICT + currentVersion, contenu serveur inchangé", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "vision");
    await owner.save(projectId, id, 1, "première");
    const stale = await owner.save(projectId, id, 1, "périmée");
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("CONFLICT");
    expect(stale.body.data).toEqual({ currentVersion: 2 });
    expect(JSON.stringify(stale.body)).not.toContain("première");
    const [row] = (await ideaRows(database, projectId)).filter((r) => r.id === id);
    expect(row).toMatchObject({ content_md: "première", version: 2 });
  });

  it("T10 : deux enregistrements concurrents sur la même version, un seul gagne", async () => {
    const { projectId, owner } = await fresh();
    const dev = ideaApi(app, scene.staff.dev);
    const id = await pageIdOf(database, projectId, "vision");
    const [a, b] = await Promise.all([
      owner.save(projectId, id, 1, "du owner"),
      dev.save(projectId, id, 1, "du dev"),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const [row] = (await ideaRows(database, projectId)).filter((r) => r.id === id);
    expect(row?.version).toBe(2);
    expect(row?.content_md).toBe(a.status === 200 ? "du owner" : "du dev");
  });

  it("refuse un contenu de plus de 50 000 caractères et un NUL", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "vision");
    expect((await owner.save(projectId, id, 1, "a".repeat(50_001))).status).toBeGreaterThanOrEqual(
      400,
    );
    const nul = await owner.save(projectId, id, 1, "a\u0000b");
    expect(nul.status).toBe(422);
    expect(nul.body.code).toBe("VALIDATION");
  });

  it("une page inconnue ou d'un autre projet est NOT_FOUND", async () => {
    const { projectId, owner } = await fresh();
    const other = await fresh();
    const foreignPage = await pageIdOf(database, other.projectId, "vision");
    expect((await owner.get(projectId, foreignPage)).status).toBe(404);
    expect((await owner.save(projectId, foreignPage, 1, "x")).status).toBe(404);
    expect((await owner.get(projectId, randomUUID())).status).toBe(404);
  });
});

describe("idea.setStatus", () => {
  it("pose à relire, stable puis brouillon (rouvrir) sur une page rédigée", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "vision");
    await owner.save(projectId, id, 1, "texte");
    for (const status of ["review", "stable", "draft"]) {
      const res = await owner.setStatus(projectId, id, status);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });

  it("refuse de marquer une page vide autrement qu'en brouillon", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "vision");
    const res = await owner.setStatus(projectId, id, "stable");
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
  });
});

describe("idea.page.create et rename", () => {
  it("crée une page vide à la fin, slug du titre, origine user, non requise", async () => {
    const { projectId, owner } = await fresh();
    const res = await owner.create(projectId, "Concurrence et alternatives");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      slug: "concurrence-et-alternatives",
      title: "Concurrence et alternatives",
      position: 10,
      required: false,
      origin: "user",
      status: "empty",
      version: 1,
      contentMd: "",
    });
  });

  it("insère après une page donnée et recalcule les positions 0..n-1", async () => {
    const { projectId, owner } = await fresh();
    const after = await pageIdOf(database, projectId, "parcours");
    const res = await owner.create(projectId, "Après parcours", after);
    expect(res.body.position).toBe(5);
    const rows = await ideaRows(database, projectId);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows[5]?.slug).toBe("apres-parcours");
    expect(rows[6]?.slug).toBe("perimetre");
  });

  it("suffixe -2 quand le slug est pris, jamais de collision", async () => {
    const { projectId, owner } = await fresh();
    expect((await owner.create(projectId, "Vision")).body.slug).toBe("vision-2");
    expect((await owner.create(projectId, "Vision")).body.slug).toBe("vision-3");
  });

  it("refuse la 51e page active (VALIDATION) et un titre multi-lignes", async () => {
    const { projectId, owner } = await fresh();
    for (let i = 0; i < 40; i += 1) {
      expect((await owner.create(projectId, `Page ${i}`)).status).toBe(200);
    }
    const full = await owner.create(projectId, "Une de trop");
    expect(full.status).toBe(422);
    expect(full.body.code).toBe("VALIDATION");
    expect((await ideaRows(database, projectId)).length).toBe(50);
    const multi = await owner.create(projectId, "a\nb");
    expect(multi.status).toBe(422);
  });

  it("rename change le titre, jamais le slug ni la version de contenu", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "mesure");
    const res = await owner.rename(projectId, id, "  Indicateurs de succès  ");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Indicateurs de succès", slug: "mesure", version: 1 });
  });
});

describe("idea.page.reorder", () => {
  it("T9 : réordonne et recalcule les positions 0..n-1", async () => {
    const { projectId, owner } = await fresh();
    const rows = await ideaRows(database, projectId);
    const ids = rows.map((r) => r.id);
    const reversed = [...ids].reverse();
    const res = await owner.reorder(projectId, reversed);
    expect(res.status).toBe(200);
    expect(res.body.pages.map((p: { id: string }) => p.id)).toEqual(reversed);
    expect((await ideaRows(database, projectId)).map((r) => r.id)).toEqual(reversed);
    expect((await ideaRows(database, projectId)).map((r) => r.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("T9 : liste incomplète, doublon, page inconnue ou d'un autre projet : VALIDATION, base inchangée", async () => {
    const { projectId, owner } = await fresh();
    const other = await fresh();
    const before = (await ideaRows(database, projectId)).map((r) => `${r.id}:${r.position}`);
    const ids = (await ideaRows(database, projectId)).map((r) => r.id);
    const foreign = (await ideaRows(database, other.projectId))[0]?.id ?? "";
    const attempts = [
      ids.slice(1),
      [...ids.slice(0, 9), ids[0] ?? ""],
      [...ids.slice(0, 9), randomUUID()],
      [...ids.slice(0, 9), foreign],
    ];
    for (const attempt of attempts) {
      const res = await owner.reorder(projectId, attempt);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION");
    }
    expect((await ideaRows(database, projectId)).map((r) => `${r.id}:${r.position}`)).toEqual(
      before,
    );
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("T8 et T12 : suppression, corbeille, restauration", () => {
  it("T8 : supprimer une page requise est FORBIDDEN (raison required_page), base inchangée", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "perimetre");
    const before = await ideaRows(database, projectId);
    const res = await owner.remove(projectId, id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(res.body.data).toEqual({ reason: "required_page" });
    expect(await ideaRows(database, projectId)).toEqual(before);
  });

  it("supprime en douceur : page hors liste, dans la corbeille, positions compactées", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "mesure");
    const res = await owner.remove(projectId, id);
    expect(res.status).toBe(200);
    expect(res.body.deletedAt).not.toBeNull();
    const list = (await owner.list(projectId)).body;
    expect(list.total).toBe(9);
    expect(list.pages.map((p: { position: number }) => p.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(list.trash.map((p: { slug: string }) => p.slug)).toEqual(["mesure"]);
    expect((await owner.get(projectId, id)).status).toBe(200);
    expect((await owner.save(projectId, id, 1, "x")).status).toBe(404);
  });

  it("restaure avant 30 jours à la fin de la liste", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "mesure");
    await owner.remove(projectId, id);
    const res = await owner.restore(projectId, id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: "mesure", deletedAt: null, position: 9 });
    expect((await owner.list(projectId)).body.total).toBe(10);
  });

  it("refuse de restaurer au-delà de 30 jours : page masquée de la corbeille (404)", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "mesure");
    await owner.remove(projectId, id);
    await database.query(
      "UPDATE idea_pages SET deleted_at = now() - interval '31 days' WHERE id = $1",
      [id],
    );
    expect((await owner.restore(projectId, id)).status).toBe(404);
    expect((await owner.list(projectId)).body.trash).toEqual([]);
  });

  it("le slug d'une page supprimée n'est jamais réutilisé", async () => {
    const { projectId, owner } = await fresh();
    await owner.remove(projectId, await pageIdOf(database, projectId, "mesure"));
    const created = await owner.create(projectId, "Mesure");
    expect(created.body.slug).toBe("mesure-2");
  });

  it("supprimer deux fois est NOT_FOUND ; restaurer une page active aussi", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "mesure");
    await owner.remove(projectId, id);
    expect((await owner.remove(projectId, id)).status).toBe(404);
    const active = await pageIdOf(database, projectId, "vision");
    expect((await owner.restore(projectId, active)).status).toBe(404);
  });

  it("restaurer est refusé quand le dossier compte déjà 50 pages actives (VALIDATION)", async () => {
    const { projectId, owner } = await fresh();
    const id = await pageIdOf(database, projectId, "mesure");
    await owner.remove(projectId, id);
    for (let i = 0; i < 41; i += 1) await owner.create(projectId, `Page ${i}`);
    const res = await owner.restore(projectId, id);
    expect(res.status).toBe(422);
  });
});
