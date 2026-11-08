import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aiAuditRows } from "./helpers/ai-bench.ts";
import {
  countOf,
  ideaAgentApi,
  installIdeaAgent,
  payloadOf,
  purposes,
  scripted,
  setContent,
} from "./helpers/idea-agent.ts";

/**
 * TK-90 lot A (C6) : `ai.ideaGaps` rend 4 manques au plus ; un second appel de moins de 30 s est mémorisé (aucun
 * appel du modèle, aucun quota) ; après 30 s, un nouvel appel. Une page nommée est reconnue, sinon c'est une page à créer.
 */
const agent = installIdeaAgent({ beforeAll, afterAll, beforeEach });
const b = () => agent.bench();
const w = () => agent.world();
const gaps = (actor: Parameters<typeof ideaAgentApi>[1], projectId: string) =>
  ideaAgentApi(b().app, actor).gaps(projectId);
const ITEMS = {
  items: [
    { page: "Vision", text: "Le public visé n'est pas dit." },
    { page: "Tarifs", text: "Aucune page ne parle des prix." },
  ],
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("ai.ideaGaps", () => {
  it("rend les manques : pageId pour une page existante, titre suggéré sinon", async () => {
    const { projectId, page } = await w().fresh();
    b().use(scripted({ gaps: ITEMS }));
    const res = await gaps(w().scene.staff.owner, projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(res.body.computedAt).toEqual(expect.any(String));
    expect(res.body.items).toEqual([
      {
        pageId: await page("vision"),
        suggestedPageTitle: null,
        text: "Le public visé n'est pas dit.",
      },
      { pageId: null, suggestedPageTitle: "Tarifs", text: "Aucune page ne parle des prix." },
    ]);
  });

  it("au plus 4 manques, même si le modèle en rend davantage", async () => {
    const { projectId } = await w().fresh();
    const many = {
      items: Array.from({ length: 7 }, (_, i) => ({ page: "Vision", text: `Manque ${i + 1}.` })),
    };
    b().use(scripted({ gaps: many }));
    const res = await gaps(w().scene.staff.owner, projectId);
    expect(res.body.items).toHaveLength(4);
    expect(res.body.items[0].text).toBe("Manque 1.");
  });

  it("le modèle reçoit les titres et contenus, sans donnée personnelle ni identifiant", async () => {
    const { projectId, page } = await w().fresh();
    const { scene } = w();
    await setContent(b().database, await page("vision"), "Un outil pour les agences.", 1);
    const fake = scripted({ gaps: ITEMS });
    b().use(fake);
    await gaps(scene.staff.owner, projectId);
    expect(purposes(fake)).toEqual(["idea-gaps"]);
    const payload = payloadOf(fake);
    expect(payload).toContain("Un outil pour les agences.");
    expect(payload).toContain("Hypothèses et risques");
    for (const secret of [
      scene.staff.owner.email,
      scene.staff.owner.name,
      scene.staff.owner.userId,
      projectId,
      scene.organizationId,
      "Projet Cèdre",
    ]) {
      expect(payload).not.toContain(secret);
    }
  });

  it("un second appel de moins de 30 s est mémorisé : aucun appel du modèle, un seul quota", async () => {
    const { projectId } = await w().fresh();
    const fake = scripted({ gaps: ITEMS });
    b().use(fake);
    const first = await gaps(w().scene.staff.owner, projectId);
    b().clock.advance(29_000);
    const second = await gaps(w().scene.staff.dev, projectId);
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(second.body.items).toEqual(first.body.items);
    expect(second.body.computedAt).toBe(first.body.computedAt);
    expect(fake.calls).toHaveLength(1);
    const audits = (await aiAuditRows(b().database, w().scene.organizationId)).filter(
      (r) => r.action === "ai.idea.gaps" && r.target_id === projectId,
    );
    expect(audits).toHaveLength(1);
  });

  it("après 30 s, un nouvel appel et un nouveau calcul mémorisé", async () => {
    const { projectId } = await w().fresh();
    const fake = scripted({ gaps: ITEMS });
    b().use(fake);
    await gaps(w().scene.staff.owner, projectId);
    b().clock.advance(31_000);
    const again = await gaps(w().scene.staff.owner, projectId);
    expect(again.body.cached).toBe(false);
    expect(fake.calls).toHaveLength(2);
    expect(
      await countOf(
        b().database,
        "SELECT count(*)::int AS n FROM idea_gap_runs WHERE project_id = $1",
        [projectId],
      ),
    ).toBe(1);
  });

  it("le résultat mémorisé est propre à chaque projet", async () => {
    const one = await w().fresh();
    const two = await w().fresh();
    const fake = scripted({ gaps: ITEMS });
    b().use(fake);
    await gaps(w().scene.staff.owner, one.projectId);
    const res = await gaps(w().scene.staff.owner, two.projectId);
    expect(res.body.cached).toBe(false);
    expect(fake.calls).toHaveLength(2);
  });

  it.each([
    ["balise HTML", "<i>trou</i>"],
    ["lien", "voir https://exemple.test"],
    ["image", "![x](http://exemple.test/a.png)"],
    ["direction", "trou ‮inversé"],
  ])("sortie hostile (%s) : 502 LLM_OUTPUT_INVALID, rien n'est mémorisé", async (_l, bad) => {
    const { projectId } = await w().fresh();
    b().use(scripted({ gaps: { items: [{ page: "Vision", text: bad }] } }));
    const res = await gaps(w().scene.staff.owner, projectId);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("LLM_OUTPUT_INVALID");
    expect(
      await countOf(
        b().database,
        "SELECT count(*)::int AS n FROM idea_gap_runs WHERE project_id = $1",
        [projectId],
      ),
    ).toBe(0);
    expect(
      await countOf(
        b().database,
        "SELECT count(*)::int AS n FROM idea_ai_locks WHERE project_id = $1",
        [projectId],
      ),
    ).toBe(0);
  });

  it("équipe et client lié : 200 ; business : 403 ; hors projet : 404", async () => {
    const { projectId } = await w().fresh();
    const { scene } = w();
    b().use(scripted({ gaps: ITEMS }));
    expect((await gaps(scene.c1, projectId)).status).toBe(200);
    expect((await gaps(scene.staff.designer, projectId)).status).toBe(200);
    const business = await gaps(scene.staff.business, projectId);
    expect(business.status).toBe(403);
    expect(business.body.code).toBe("FORBIDDEN");
    for (const actor of [scene.c3, scene.c2, scene.foreign.owner]) {
      expect((await gaps(actor, projectId)).status).toBe(404);
    }
  });
});
