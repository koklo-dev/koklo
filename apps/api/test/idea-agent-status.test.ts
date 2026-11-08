import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aiAuditRows } from "./helpers/ai-bench.ts";
import { ideaApi } from "./helpers/idea.ts";
import {
  countOf,
  errorOf,
  ideaAgentApi,
  insertMessage,
  installIdeaAgent,
  scripted,
} from "./helpers/idea-agent.ts";

/**
 * TK-90 lot A (C4) : sans clé d'IA, l'agent dit qu'il n'est pas configuré (`idea.agent.status`), le chat et
 * les manques refusent (LLM_NOT_CONFIGURED) et le dossier reste entièrement utilisable. Le fil des messages
 * (`idea.message.list`) est lisible par les rôles de lecture de l'espace Idée.
 */
const agent = installIdeaAgent({ beforeAll, afterAll, beforeEach });
const b = () => agent.bench();
const w = () => agent.world();

describe("idea.agent.status", () => {
  it("rend configured et canConfigure selon la clé de l'organisation et le rôle", async () => {
    const { projectId } = await w().fresh();
    const { scene } = w();
    // La clé du monde est posée : configurée pour tous, configurable par owner et admin seulement.
    for (const [actor, canConfigure] of [
      [scene.staff.owner, true],
      [scene.staff.admin, true],
      [scene.staff.dev, false],
      [scene.staff.designer, false],
      [scene.c1, false],
      [scene.staff.business, false],
    ] as const) {
      const res = await ideaAgentApi(b().app, actor).status(projectId);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toEqual({ configured: true, canConfigure });
    }
  });

  it("une organisation sans clé n'est pas configurée", async () => {
    const other = await (await import("./helpers/idea-agent.ts")).createIdeaWorld(b());
    await b().database.query("DELETE FROM llm_provider_credentials WHERE organization_id = $1", [
      other.scene.organizationId,
    ]);
    const { projectId } = await other.fresh();
    const res = await ideaAgentApi(b().app, other.scene.staff.owner).status(projectId);
    expect(res.body).toEqual({ configured: false, canConfigure: true });
    const client = await ideaAgentApi(b().app, other.scene.c1).status(projectId);
    expect(client.body).toEqual({ configured: false, canConfigure: false });
  });

  it("projet hors périmètre : 404 uniforme (client non lié, autre organisation)", async () => {
    const { projectId } = await w().fresh();
    const { scene } = w();
    expect((await ideaAgentApi(b().app, scene.c3).status(projectId)).status).toBe(404);
    expect((await ideaAgentApi(b().app, scene.c2).status(projectId)).status).toBe(404);
    expect((await ideaAgentApi(b().app, scene.foreign.owner).status(projectId)).status).toBe(404);
    expect((await ideaAgentApi(b().app, undefined).status(projectId)).status).toBe(401);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("sans clé d'IA : l'agent refuse, le dossier fonctionne", () => {
  async function keyless() {
    const world = await (await import("./helpers/idea-agent.ts")).createIdeaWorld(b());
    await b().database.query("DELETE FROM llm_provider_credentials WHERE organization_id = $1", [
      world.scene.organizationId,
    ]);
    return { world, ...(await world.fresh()) };
  }

  it("ai.ideaChat : 409 LLM_NOT_CONFIGURED, ni verrou, ni audit, ni message, aucun appel du modèle", async () => {
    const { world, projectId } = await keyless();
    const fake = scripted();
    b().use(fake);
    const res = await ideaAgentApi(b().app, world.scene.staff.owner).chat(projectId, {
      mode: "interview",
      text: "Voici mon idée",
    });
    expect(res.status, res.text).toBe(409);
    expect(res.body.code).toBe("LLM_NOT_CONFIGURED");
    expect(fake.calls).toHaveLength(0);
    const db = b().database;
    expect(
      await countOf(db, "SELECT count(*)::int AS n FROM idea_ai_locks WHERE project_id = $1", [
        projectId,
      ]),
    ).toBe(0);
    expect(
      await countOf(db, "SELECT count(*)::int AS n FROM idea_messages WHERE project_id = $1", [
        projectId,
      ]),
    ).toBe(0);
    expect(
      (await aiAuditRows(db, world.scene.organizationId)).filter(
        (r) => r.action === "ai.idea.chat",
      ),
    ).toEqual([]);
    expect(errorOf(res.text)).toBeUndefined();
  });

  it("ai.ideaGaps : 409 LLM_NOT_CONFIGURED", async () => {
    const { world, projectId } = await keyless();
    const res = await ideaAgentApi(b().app, world.scene.staff.dev).gaps(projectId);
    expect(res.status, res.text).toBe(409);
    expect(res.body.code).toBe("LLM_NOT_CONFIGURED");
  });

  it("les pages (créer, enregistrer, renommer, réordonner, supprimer) fonctionnent comme avant", async () => {
    const { world, projectId, page } = await keyless();
    const owner = ideaApi(b().app, world.scene.staff.owner);
    const created = await owner.create(projectId, "Concurrence");
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const saved = await owner.save(projectId, created.body.id, 1, "Texte");
    expect(saved.status).toBe(200);
    expect((await owner.rename(projectId, created.body.id, "Marché")).status).toBe(200);
    const listing = await owner.list(projectId);
    const ids = listing.body.pages.map((p: { id: string }) => p.id).reverse();
    expect((await owner.reorder(projectId, ids)).status).toBe(200);
    expect((await owner.remove(projectId, created.body.id)).status).toBe(200);
    expect((await owner.get(projectId, await page("vision"))).status).toBe(200);
    // Le client rédige aussi sans clé (mêmes droits que l'agent n'ayant rien à faire).
    const client = ideaApi(b().app, world.scene.c1);
    expect((await client.save(projectId, await page("vision"), 1, "Mot du client")).status).toBe(
      200,
    );
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("idea.message.list", () => {
  // biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
  it("rend les messages du plus récent au plus ancien, sans identifiant ni e-mail, par curseur", async () => {
    const { projectId, page } = await w().fresh();
    const { scene } = w();
    const s = { organizationId: scene.organizationId, projectId };
    const vision = await page("vision");
    await insertMessage(b().database, s, {
      userId: scene.staff.owner.userId,
      text: "Premier",
      pageId: vision,
    });
    await insertMessage(b().database, s, {
      userId: null,
      text: "Réponse de l'agent",
      pageId: vision,
    });
    await insertMessage(b().database, s, {
      userId: scene.c1.userId,
      text: "Dernier",
      mode: "free",
    });

    const res = await ideaAgentApi(b().app, scene.staff.dev).messages(projectId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items.map((m: { text: string }) => m.text)).toEqual([
      "Dernier",
      "Réponse de l'agent",
      "Premier",
    ]);
    expect(res.body.total).toBe(3);
    const [last, agentMessage, first] = res.body.items;
    expect(last).toMatchObject({
      author: { name: scene.c1.name, isClient: true },
      mode: "free",
      pageId: null,
    });
    expect(agentMessage.author).toBeNull();
    expect(first).toMatchObject({
      author: { name: scene.staff.owner.name, isClient: false },
      pageId: vision,
    });
    const text = JSON.stringify(res.body);
    for (const secret of [
      scene.c1.userId,
      scene.c1.email,
      scene.staff.owner.userId,
      scene.staff.owner.email,
    ]) {
      expect(text).not.toContain(secret);
    }

    const firstPage = await ideaAgentApi(b().app, scene.staff.dev).messages(projectId, "limit=2");
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.nextCursor).not.toBeNull();
    const older = await ideaAgentApi(b().app, scene.staff.dev).messages(
      projectId,
      `limit=2&cursor=${firstPage.body.nextCursor}`,
    );
    expect(older.body.items.map((m: { text: string }) => m.text)).toEqual(["Premier"]);
    expect(older.body.nextCursor).toBeNull();
  });

  it("lisible par le client lié et le business ; 404 hors périmètre ; curseur invalide : 422", async () => {
    const { projectId } = await w().fresh();
    const { scene } = w();
    expect((await ideaAgentApi(b().app, scene.c1).messages(projectId)).status).toBe(200);
    expect((await ideaAgentApi(b().app, scene.staff.business).messages(projectId)).status).toBe(
      200,
    );
    expect((await ideaAgentApi(b().app, scene.c3).messages(projectId)).status).toBe(404);
    expect((await ideaAgentApi(b().app, scene.foreign.owner).messages(projectId)).status).toBe(404);
    const bad = await ideaAgentApi(b().app, scene.staff.owner).messages(
      projectId,
      "cursor=nimporte",
    );
    expect(bad.status).toBe(422);
  });

  it("ne montre jamais les messages d'un autre projet", async () => {
    const one = await w().fresh();
    const two = await w().fresh();
    const { scene } = w();
    await insertMessage(
      b().database,
      { organizationId: scene.organizationId, projectId: one.projectId },
      { userId: scene.staff.owner.userId, text: "Secret du projet un" },
    );
    const res = await ideaAgentApi(b().app, scene.staff.owner).messages(two.projectId);
    expect(res.body.items).toEqual([]);
  });
});
