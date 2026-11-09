import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ideaApi } from "./helpers/idea.ts";
import { installIdeaAgent, scripted } from "./helpers/idea-agent.ts";
import {
  framingProject,
  freezeApi,
  makeRequiredStable,
  settleBatch,
  versionRows,
} from "./helpers/idea-freeze.ts";

/**
 * TK-91 lot A : `idea.list` enrichi (maturité, questions ouvertes, version, « modifié depuis ») et réconciliation
 * des versions avec leur lot (commit renseigné, échec supprimé). La Synthèse ne compte pas dans la jauge.
 */
const agent = installIdeaAgent({ beforeAll, afterAll, beforeEach });
const b = () => agent.bench();
const w = () => agent.world();
const list = (projectId: string, actor = w().scene.staff.owner) =>
  ideaApi(b().app, actor).list(projectId);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("idea.list : maturité", () => {
  it("projet neuf : 0 page stable sur 10, les quatre requises manquent, aucune version", async () => {
    const { projectId } = await w().fresh();
    const res = await list(projectId);
    expect(res.status).toBe(200);
    expect(res.body.maturity).toEqual({
      stable: 0,
      total: 10,
      missingRequired: ["Vision", "Problème", "Utilisateurs", "Périmètre"],
      openQuestions: 0,
    });
    expect(res.body.version).toEqual({ latest: null, modifiedSince: false });
  });

  it("trois requises stables sur quatre : il manque Périmètre ; total n'inclut ni la corbeille ni la Synthèse", async () => {
    const { projectId } = await w().fresh();
    await b().database.query(
      "UPDATE idea_pages SET status = 'stable' WHERE project_id = $1 AND slug IN ('vision','probleme','utilisateurs','mesure')",
      [projectId],
    );
    await b().database.query(
      "UPDATE idea_pages SET deleted_at = now() WHERE project_id = $1 AND slug = 'glossaire'",
      [projectId],
    );
    b().use(scripted());
    await freezeApi(b().app, w().scene.staff.owner).regenerate(projectId);
    const { maturity } = (await list(projectId)).body;
    expect(maturity).toMatchObject({ stable: 4, total: 9, missingRequired: ["Périmètre"] });
  });

  it("le titre dit est le titre courant d'une page requise renommée", async () => {
    const { projectId } = await w().fresh();
    await b().database.query(
      "UPDATE idea_pages SET title = 'Cible' WHERE project_id = $1 AND slug = 'utilisateurs'",
      [projectId],
    );
    expect((await list(projectId)).body.maturity.missingRequired).toContain("Cible");
  });

  it("questions ouvertes : tâches non cochées de Hypothèses et risques, hors corbeille", async () => {
    const { projectId, page } = await w().fresh();
    const hypotheses = await page("hypotheses-risques");
    await b().database.query(
      "UPDATE idea_pages SET content_md = $2, status = 'draft' WHERE id = $1",
      [hypotheses, "- [ ] Le client paiera-t-il ?\n- [x] Marché confirmé\n- [ ] Qui valide ?\n"],
    );
    await b().database.query("UPDATE idea_pages SET content_md = '- [ ] ailleurs' WHERE id = $1", [
      await page("vision"),
    ]);
    expect((await list(projectId)).body.maturity.openQuestions).toBe(2);
    await b().database.query("UPDATE idea_pages SET deleted_at = now() WHERE id = $1", [
      hypotheses,
    ]);
    expect((await list(projectId)).body.maturity.openQuestions).toBe(0);
  });

  it("le client lié et le business lisent la même maturité", async () => {
    const { projectId } = await w().fresh();
    const staff = (await list(projectId)).body.maturity;
    expect((await list(projectId, w().scene.c1)).body.maturity).toEqual(staff);
    expect((await list(projectId, w().scene.staff.business)).body.maturity).toEqual(staff);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("idea.list : version et modifié depuis", () => {
  async function frozen() {
    const project = await framingProject(b(), w());
    b().use(scripted());
    const res = await freezeApi(b().app, w().scene.staff.owner).freeze(
      project.projectId,
      `k-${randomUUID()}`,
    );
    return { ...project, batchId: res.body.batchId as string };
  }

  it("tant que le lot n'est pas commité, il n'y a pas de dernière version", async () => {
    const { projectId } = await frozen();
    expect((await list(projectId)).body.version).toEqual({ latest: null, modifiedSince: false });
    expect((await versionRows(b().database, projectId))[0]?.commit_sha).toBeNull();
  });

  it("un lot commité renseigne le commit de la version ; elle devient la dernière version", async () => {
    const { projectId, batchId } = await frozen();
    await settleBatch(b().database, batchId, "committed", "c".repeat(40));
    const res = await list(projectId);
    expect(res.body.version.latest).toEqual({
      number: 1,
      tag: "idea-v1",
      commitSha: "c".repeat(40),
      frozenAt: expect.any(String),
    });
    expect(res.body.version.modifiedSince).toBe(false);
    expect((await versionRows(b().database, projectId))[0]?.commit_sha).toBe("c".repeat(40));
    expect(JSON.stringify(res.body.version)).not.toMatch(/frozenBy|userId|email/i);
  });

  it("modifiedSince : vrai après l'édition d'une page, faux après une nouvelle version", async () => {
    const { projectId, batchId, page } = await frozen();
    await settleBatch(b().database, batchId, "committed");
    expect((await list(projectId)).body.version.modifiedSince).toBe(false);
    const vision = await page("vision");
    const saved = await ideaApi(b().app, w().scene.staff.dev).save(
      projectId,
      vision,
      2,
      "Texte modifié",
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((await list(projectId)).body.version.modifiedSince).toBe(true);
    const next = await freezeApi(b().app, w().scene.staff.dev).freeze(
      projectId,
      `k-${randomUUID()}`,
    );
    expect(next.body.tag).toBe("idea-v2");
    await settleBatch(b().database, next.body.batchId, "committed", "d".repeat(40));
    const after = (await list(projectId)).body.version;
    expect(after.latest.tag).toBe("idea-v2");
    expect(after.modifiedSince).toBe(false);
  });

  it("une page ajoutée, puis supprimée, compte comme une modification", async () => {
    const { projectId, batchId } = await frozen();
    await settleBatch(b().database, batchId, "committed");
    const created = await ideaApi(b().app, w().scene.staff.dev).create(projectId, "Annexe");
    expect(created.status).toBe(200);
    expect((await list(projectId)).body.version.modifiedSince).toBe(true);
  });

  it("une nouvelle Synthèse ne compte pas comme une modification", async () => {
    const { projectId, batchId } = await frozen();
    await settleBatch(b().database, batchId, "committed");
    b().use(scripted({ synthesis: { contentMd: "## Autre" } }));
    await freezeApi(b().app, w().scene.staff.owner).regenerate(projectId);
    expect((await list(projectId)).body.version.modifiedSince).toBe(false);
  });

  it("un lot en échec ou en conflit supprime la ligne de version (numérotation sans trou)", async () => {
    for (const status of ["failed", "conflict"] as const) {
      const { projectId, batchId } = await frozen();
      await settleBatch(b().database, batchId, status);
      expect((await list(projectId)).body.version).toEqual({ latest: null, modifiedSince: false });
      expect(await versionRows(b().database, projectId)).toHaveLength(0);
    }
  });

  it("une ligne de version sans lot, abandonnée depuis plus de 5 minutes, est supprimée au prochain passage", async () => {
    const project = await framingProject(b(), w());
    await b().database.query(
      `INSERT INTO idea_versions (id, organization_id, project_id, number, tag, pages_versions, frozen_at, updated_at)
       VALUES ($1, $2, $3, 1, 'idea-v1', '{}'::jsonb, now() - interval '10 minutes', now())`,
      [randomUUID(), w().scene.organizationId, project.projectId],
    );
    b().use(scripted());
    const res = await freezeApi(b().app, w().scene.staff.owner).freeze(
      project.projectId,
      `k-${randomUUID()}`,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.tag).toBe("idea-v1");
  });
});

describe("idea.list : projet sans version", () => {
  it("makeRequiredStable rend les quatre requises stables et la liste le dit", async () => {
    const { projectId } = await w().fresh();
    await makeRequiredStable(b().database, projectId);
    const { maturity } = (await list(projectId)).body;
    expect(maturity).toMatchObject({ stable: 4, missingRequired: [] });
  });
});
