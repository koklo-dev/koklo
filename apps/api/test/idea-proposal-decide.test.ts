import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ideaApi } from "./helpers/idea.ts";
import {
  countOf,
  ideaAgentApi,
  insertProposal,
  installIdeaAgent,
  pagesSnapshot,
  proposalRows,
  setContent,
} from "./helpers/idea-agent.ts";

/**
 * TK-90 lot A : `idea.proposal.decide` et `undo` (C1b, C1c, stale, annulation) et l'extension additive de
 * `idea.list` / `idea.get`. Les propositions sont posées en SQL : ces tests ne dépendent pas du chat.
 */
const agent = installIdeaAgent({ beforeAll, afterAll, beforeEach });
const b = () => agent.bench();
const w = () => agent.world();
const DOC = "Un.\n\nDeux.\n\nTrois.";

async function setup(content = DOC, version = 1) {
  const { projectId, page } = await w().fresh();
  const pageId = await page("vision");
  await setContent(b().database, pageId, content, version);
  const scope = { organizationId: w().scene.organizationId, projectId };
  const pageRow = async () =>
    (await pagesSnapshot(b().database, projectId)).find((p) => p.id === pageId);
  const make = (over: Parameters<typeof insertProposal>[2] = {}) =>
    insertProposal(b().database, scope, { pageId, baseVersion: version, ...over });
  const owner = ideaAgentApi(b().app, w().scene.staff.owner);
  return { projectId, pageId, scope, make, pageRow, owner, page };
}
const rowOf = async (projectId: string, id: string) =>
  (await proposalRows(b().database, projectId)).find((r) => r.id === id);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("C1b : accepter applique l'opération et la version, en une transaction", () => {
  it.each([
    ["append", { op: "append" }, "Un.\n\nDeux.\n\nTrois.\n\nNeuf."],
    ["insert_after", { op: "insert_after", anchor: 0 }, "Un.\n\nNeuf.\n\nDeux.\n\nTrois."],
    ["replace d'un bloc", { op: "replace", anchor: 1 }, "Un.\n\nNeuf.\n\nTrois."],
    ["replace d'une plage", { op: "replace", anchor: 0, rangeEnd: 1 }, "Neuf.\n\nTrois."],
  ])("%s : contenu, version + 1, statut, annulation possible", async (_label, over, expected) => {
    const { projectId, pageId, make, pageRow, owner } = await setup(DOC, 4);
    const id = await make({ ...over, contentMd: "Neuf." });

    const res = await owner.decide(projectId, id, "accept");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.page).toMatchObject({ id: pageId, contentMd: expected, version: 5 });
    expect(res.body.proposal).toMatchObject({ id, status: "accepted" });
    expect(await pageRow()).toMatchObject({ content_md: expected, version: 5 });
    expect(await rowOf(projectId, id)).toMatchObject({
      status: "accepted",
      decided_by: w().scene.staff.owner.userId,
      previous_content_md: DOC,
      result_version: 5,
    });
    const audits = await b().database.query(
      "SELECT 1 FROM audit_log WHERE action = 'idea.proposal.accept' AND target_id = $1",
      [pageId],
    );
    expect(audits).toHaveLength(1);
  });

  it("l'acceptation compte l'auteur comme contributeur et passe une page vide en brouillon", async () => {
    const { projectId, pageId, make, owner } = await setup("", 1);
    const id = await make({ op: "append", contentMd: "Premier texte." });
    const res = await owner.decide(projectId, id, "accept");
    expect(res.body.page).toMatchObject({ contentMd: "Premier texte.", status: "draft" });
    const contributors = await b().database.query(
      "SELECT 1 FROM idea_page_contributors WHERE page_id = $1 AND user_id = $2",
      [pageId, w().scene.staff.owner.userId],
    );
    expect(contributors).toHaveLength(1);
  });

  it("create_page crée la page de l'agent après la page visée, positions contiguës", async () => {
    const { projectId, page, make, owner } = await setup();
    const after = await page("probleme");
    const id = await make({
      op: "create_page",
      title: "Concurrence",
      afterPageId: after,
      contentMd: "Les concurrents.",
    });
    const res = await owner.decide(projectId, id, "accept");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.page).toMatchObject({
      title: "Concurrence",
      origin: "agent",
      contentMd: "Les concurrents.",
      version: 1,
      position: 2,
    });
    expect(await rowOf(projectId, id)).toMatchObject({
      status: "accepted",
      created_page_id: res.body.page.id,
      result_version: 1,
    });
    const positions = await b().database.query<{ position: number; title: string }>(
      "SELECT position, title FROM idea_pages WHERE project_id = $1 AND deleted_at IS NULL ORDER BY position",
      [projectId],
    );
    expect(positions.map((p) => p.position)).toEqual(Array.from({ length: 11 }, (_, i) => i));
    expect(positions[2]?.title).toBe("Concurrence");
  });

  it("create_page sans page de repère va à la fin ; un dossier plein est refusé sans effet", async () => {
    const { projectId, make, owner, scope } = await setup();
    const id = await make({ op: "create_page", title: "Fin", contentMd: "x" });
    expect((await owner.decide(projectId, id, "accept")).body.page.position).toBe(10);
    for (let i = 0; i < 39; i += 1)
      await ideaApi(b().app, w().scene.staff.owner).create(projectId, `P${i}`);
    const full = await insertProposal(b().database, scope, { op: "create_page", title: "De trop" });
    const before = await countOf(
      b().database,
      "SELECT count(*)::int AS n FROM idea_pages WHERE project_id = $1",
      [projectId],
    );
    const res = await owner.decide(projectId, full, "accept");
    expect(res.status).toBe(422);
    expect(
      await countOf(
        b().database,
        "SELECT count(*)::int AS n FROM idea_pages WHERE project_id = $1",
        [projectId],
      ),
    ).toBe(before);
    expect((await rowOf(projectId, full))?.status).toBe("pending");
  });

  it("accepter une proposition périme les autres propositions en attente de la page", async () => {
    const { projectId, make, owner } = await setup();
    const first = await make({ op: "append" });
    const second = await make({ op: "insert_after", anchor: 0 });
    await owner.decide(projectId, first, "accept");
    expect((await rowOf(projectId, second))?.status).toBe("stale");
  });

  it("Modifier : le texte édité par l'humain remplace celui de l'agent", async () => {
    const { projectId, make, owner } = await setup();
    const id = await make({ op: "append", contentMd: "Texte de l'agent." });
    const res = await owner.decide(projectId, id, "accept", "Texte corrigé par l'humain.");
    expect(res.body.page.contentMd).toBe(`${DOC}\n\nTexte corrigé par l'humain.`);
    expect((await rowOf(projectId, id))?.content_md).toBe("Texte corrigé par l'humain.");
  });

  it("un échec en milieu de transaction n'a aucun effet (audit refusé)", async () => {
    const { projectId, make, owner, pageRow } = await setup();
    const id = await make({ op: "append" });
    const other = await make({ op: "insert_after", anchor: 0 });
    await b().database.query("INSERT INTO audit_fail (action) VALUES ('idea.proposal.accept')");
    const res = await owner.decide(projectId, id, "accept");
    expect(res.status).toBe(500);
    expect(await pageRow()).toMatchObject({ content_md: DOC, version: 1 });
    expect((await rowOf(projectId, id))?.status).toBe("pending");
    expect((await rowOf(projectId, other))?.status).toBe("pending");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("stale : la version de base a changé", () => {
  it("accepter une proposition dont la version est périmée : 409 CONFLICT, proposition stale, page intacte", async () => {
    const { projectId, pageId, make, owner, pageRow } = await setup(DOC, 1);
    const id = await make({ op: "append" });
    await b().database.query("UPDATE idea_pages SET version = 2 WHERE id = $1", [pageId]);

    const res = await owner.decide(projectId, id, "accept");

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
    expect(res.body.data).toEqual({ currentVersion: 2 });
    expect((await rowOf(projectId, id))?.status).toBe("stale");
    expect(await pageRow()).toMatchObject({ content_md: DOC, version: 2 });
  });

  it("une proposition déjà périmée refuse aussi, avec la version courante", async () => {
    const { projectId, make, owner } = await setup();
    const id = await make({ status: "stale" });
    const res = await owner.decide(projectId, id, "accept");
    expect(res.status).toBe(409);
    expect(res.body.data.currentVersion).toBe(1);
  });

  it("rejeter une proposition déjà périmée réussit : rejected, audité (B253) ; l'acceptation reste en 409", async () => {
    const { projectId, pageId, make, owner } = await setup();
    const id = await make({ status: "stale" });
    const res = await owner.decide(projectId, id, "reject");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ proposal: { id, status: "rejected" }, page: null });
    expect((await rowOf(projectId, id))?.status).toBe("rejected");
    const audits = await b().database.query(
      "SELECT 1 FROM audit_log WHERE action = 'idea.proposal.reject' AND target_id = $1",
      [pageId],
    );
    expect(audits).toHaveLength(1);
  });

  it("une ancre qui ne vise plus un bloc est refusée sans effet", async () => {
    const { projectId, make, owner, pageRow } = await setup("Seul.");
    const id = await make({ op: "insert_after", anchor: 4 });
    const res = await owner.decide(projectId, id, "accept");
    expect(res.status).toBe(409);
    expect(await pageRow()).toMatchObject({ content_md: "Seul.", version: 1 });
  });

  it("idea.save périme les propositions en attente de la page, pas celles des autres pages", async () => {
    const { projectId, pageId, make, scope, page } = await setup();
    const mine = await make({ op: "append" });
    const otherPage = await page("probleme");
    const theirs = await insertProposal(b().database, scope, { pageId: otherPage, baseVersion: 1 });
    const saved = await ideaApi(b().app, w().scene.staff.owner).save(
      projectId,
      pageId,
      1,
      "Écrit à la main",
    );
    expect(saved.status).toBe(200);
    expect((await rowOf(projectId, mine))?.status).toBe("stale");
    expect((await rowOf(projectId, theirs))?.status).toBe("pending");
  });

  it("idea.page.delete périme les propositions de la page", async () => {
    const { projectId, make, scope } = await setup();
    const created = await ideaApi(b().app, w().scene.staff.owner).create(projectId, "À supprimer");
    const id = await insertProposal(b().database, scope, {
      pageId: created.body.id,
      baseVersion: 1,
    });
    const mine = await make({ op: "append" });
    await ideaApi(b().app, w().scene.staff.owner).remove(projectId, created.body.id);
    expect((await rowOf(projectId, id))?.status).toBe("stale");
    expect((await rowOf(projectId, mine))?.status).toBe("pending");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("rejeter, états et droits (C1c)", () => {
  it("rejeter marque la proposition et ne touche pas la page", async () => {
    const { projectId, make, owner, pageRow } = await setup();
    const id = await make({ op: "append" });
    const res = await owner.decide(projectId, id, "reject");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ proposal: { id, status: "rejected" }, page: null });
    expect(await pageRow()).toMatchObject({ content_md: DOC, version: 1 });
    expect(await rowOf(projectId, id)).toMatchObject({
      status: "rejected",
      decided_by: w().scene.staff.owner.userId,
    });
  });

  it("décider deux fois : 422 (plus en attente)", async () => {
    const { projectId, make, owner } = await setup();
    const id = await make();
    await owner.decide(projectId, id, "reject");
    expect((await owner.decide(projectId, id, "accept")).status).toBe(422);
  });

  it("équipe et client lié décident ; le business est refusé (403)", async () => {
    const { projectId, make } = await setup();
    const { scene } = w();
    for (const actor of [
      scene.staff.owner,
      scene.staff.admin,
      scene.staff.dev,
      scene.staff.designer,
      scene.c1,
    ]) {
      const id = await make();
      const res = await ideaAgentApi(b().app, actor).decide(projectId, id, "reject");
      expect(res.status, `${actor.role} : ${JSON.stringify(res.body)}`).toBe(200);
    }
    const id = await make();
    const business = await ideaAgentApi(b().app, scene.staff.business).decide(
      projectId,
      id,
      "accept",
    );
    expect(business.status).toBe(403);
    expect(business.body.code).toBe("FORBIDDEN");
    expect((await ideaAgentApi(b().app, scene.staff.business).undo(projectId, id)).status).toBe(
      403,
    );
    expect((await rowOf(projectId, id))?.status).toBe("pending");
  });

  it("hors projet : 404 (client non lié, autre organisation) ; proposition d'un autre projet : 404", async () => {
    const { projectId, make, owner } = await setup();
    const { scene } = w();
    const id = await make();
    for (const actor of [scene.c3, scene.c2, scene.foreign.owner]) {
      expect((await ideaAgentApi(b().app, actor).decide(projectId, id, "accept")).status).toBe(404);
    }
    const otherProject = await w().fresh();
    const otherPage = await otherProject.page("vision");
    const foreign = await insertProposal(
      b().database,
      { organizationId: scene.organizationId, projectId: otherProject.projectId },
      { pageId: otherPage, baseVersion: 1 },
    );
    const res = await owner.decide(projectId, foreign, "accept");
    expect(res.status).toBe(404);
    expect((await rowOf(otherProject.projectId, foreign))?.status).toBe("pending");
    expect(
      (await owner.decide(projectId, "11111111-1111-4111-8111-111111111111", "accept")).status,
    ).toBe(404);
  });

  it("un texte modifié trop long est refusé (400) sans effet", async () => {
    const { projectId, make, owner } = await setup();
    const id = await make();
    expect((await owner.decide(projectId, id, "accept", "a".repeat(50_001))).status).toBe(400);
    expect((await rowOf(projectId, id))?.status).toBe("pending");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("idea.proposal.undo", () => {
  it("annule un rejet : la proposition redevient en attente", async () => {
    const { projectId, make, owner } = await setup();
    const id = await make();
    await owner.decide(projectId, id, "reject");
    const res = await owner.undo(projectId, id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.proposal.status).toBe("pending");
    expect(await rowOf(projectId, id)).toMatchObject({ status: "pending", decided_by: null });
  });

  it("annule un rejet devenu périmé : la proposition est périmée, pas en attente", async () => {
    const { projectId, pageId, make, owner } = await setup();
    const id = await make();
    await owner.decide(projectId, id, "reject");
    await b().database.query("UPDATE idea_pages SET version = 3 WHERE id = $1", [pageId]);
    expect((await owner.undo(projectId, id)).body.proposal.status).toBe("stale");
  });

  it("annule une acceptation : le contenu d'avant revient (nouvelle version), la proposition est de nouveau en attente", async () => {
    const { projectId, pageId, make, owner, pageRow } = await setup(DOC, 2);
    const id = await make({ op: "insert_after", anchor: 0, contentMd: "Neuf." });
    await owner.decide(projectId, id, "accept");

    const res = await owner.undo(projectId, id);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.page).toMatchObject({ id: pageId, contentMd: DOC, version: 4 });
    expect(await pageRow()).toMatchObject({ content_md: DOC, version: 4 });
    expect(await rowOf(projectId, id)).toMatchObject({
      status: "pending",
      base_version: 4,
      previous_content_md: null,
      result_version: null,
      decided_by: null,
    });
    // Rejouable : la même proposition peut être acceptée à nouveau.
    const again = await owner.decide(projectId, id, "accept");
    expect(again.body.page.contentMd).toBe("Un.\n\nNeuf.\n\nDeux.\n\nTrois.");
  });

  it("refuse d'annuler si la page a changé depuis l'acceptation (409), page intacte", async () => {
    const { projectId, make, owner, pageRow } = await setup();
    const id = await make({ op: "append", contentMd: "Neuf." });
    await owner.decide(projectId, id, "accept");
    const saved = await ideaApi(b().app, w().scene.staff.owner).save(
      projectId,
      (await pageRow())?.id ?? "",
      2,
      "Réécrit",
    );
    expect(saved.status).toBe(200);
    const res = await owner.undo(projectId, id);
    expect(res.status).toBe(409);
    expect(res.body.data).toEqual({ currentVersion: 3 });
    expect(await pageRow()).toMatchObject({ content_md: "Réécrit", version: 3 });
  });

  it("une page ajoutée par l'agent ne s'annule pas (la corbeille tient ce rôle) : 422", async () => {
    const { projectId, make, owner } = await setup();
    const id = await make({ op: "create_page", title: "Concurrence" });
    await owner.decide(projectId, id, "accept");
    const res = await owner.undo(projectId, id);
    expect(res.status).toBe(422);
    expect((await rowOf(projectId, id))?.status).toBe("accepted");
  });

  it("une proposition en attente ou périmée n'a rien à annuler : 422 ; client lié autorisé", async () => {
    const { projectId, make } = await setup();
    const pending = await make();
    const stale = await make({ status: "stale" });
    const client = ideaAgentApi(b().app, w().scene.c1);
    expect((await client.undo(projectId, pending)).status).toBe(422);
    expect((await client.undo(projectId, stale)).status).toBe(422);
    await client.decide(projectId, pending, "reject");
    expect((await client.undo(projectId, pending)).status).toBe(200);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("idea.list et idea.get : extension additive", () => {
  it("list : pendingProposals par page et pendingPageProposals, sans contenu de page", async () => {
    const { projectId, pageId, make, scope, page } = await setup();
    await make({ op: "append" });
    await make({ op: "append" });
    await make({ status: "stale" });
    await make({ status: "rejected" });
    await insertProposal(b().database, scope, { pageId: await page("probleme"), baseVersion: 1 });
    const create = await insertProposal(b().database, scope, {
      op: "create_page",
      title: "Tarifs",
      contentMd: "Les prix.",
    });

    const res = await ideaApi(b().app, w().scene.c1).list(projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const counts = Object.fromEntries(
      res.body.pages.map((p: { id: string; pendingProposals: number }) => [
        p.id,
        p.pendingProposals,
      ]),
    );
    expect(counts[pageId]).toBe(2);
    expect(counts[await page("probleme")]).toBe(1);
    expect(counts[await page("utilisateurs")]).toBe(0);
    expect(res.body.pages[0]).not.toHaveProperty("contentMd");
    expect(res.body.pendingPageProposals).toHaveLength(1);
    expect(res.body.pendingPageProposals[0]).toMatchObject({
      id: create,
      op: "create_page",
      title: "Tarifs",
      pageId: null,
      status: "pending",
    });
    expect(res.body.pendingPageProposals[0].messageId).toEqual(expect.any(String));
  });

  it("get : seules les propositions en attente de cette page, jamais d'identifiant d'utilisateur", async () => {
    const { projectId, pageId, make, scope, page } = await setup();
    const pending = await make({ op: "insert_after", anchor: 1, contentMd: "Ajout." });
    await make({ status: "stale" });
    await make({ status: "accepted" });
    await insertProposal(b().database, scope, { pageId: await page("probleme"), baseVersion: 1 });
    const res = await ideaApi(b().app, w().scene.staff.business).get(projectId, pageId);
    expect(res.status).toBe(200);
    expect(res.body.contentMd).toBe(DOC);
    expect(res.body.proposals.map((p: { id: string }) => p.id)).toEqual([pending]);
    expect(res.body.proposals[0]).toMatchObject({
      op: "insert_after",
      anchorBlockIndex: 1,
      baseVersion: 1,
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(w().scene.staff.owner.userId);
    expect(text).not.toContain("decided");
  });

  it("une page sans proposition rend une liste vide", async () => {
    const { projectId, page } = await w().fresh();
    const res = await ideaApi(b().app, w().scene.staff.owner).get(projectId, await page("vision"));
    expect(res.body.proposals).toEqual([]);
  });
});
