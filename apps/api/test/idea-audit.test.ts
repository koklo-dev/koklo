import { randomUUID } from "node:crypto";
import { contract } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { type ClientScene, createClientScene } from "./helpers/client-scene.ts";
import { ideaApi, pageIdOf, seedIdeaTemplate } from "./helpers/idea.ts";
import { ideaAgentApi, insertProposal } from "./helpers/idea-agent.ts";

/**
 * TK-89 : chaque écriture du dossier d'idée produit exactement une entrée d'audit (acteur, cible, projet) ;
 * un refus n'en produit aucune. `idea.presence` est un signal de présence toutes les 15 s : hors journal
 * (comme `project.visit`), `idea.publish` est journalisé par le lot (`spec.batch.submit`, idea-publish.test.ts).
 */
let database: TestDatabase;
let app: INestApplication;
let scene: ClientScene;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  scene = await createClientScene(database);
  await seedIdeaTemplate(database, {
    organizationId: scene.organizationId,
    projectId: scene.projects.p1,
  });
}, 120_000);
afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const UNAUDITED_HERE = ["idea.presence", "idea.publish"];
/** Le passage au cadrage exige un dépôt de spec et le modèle : son audit est prouvé dans `idea-freeze.test.ts`. */
const AUDITED_ELSEWHERE = ["idea.freeze"];
type Node = { "~orpc"?: { meta: { "~openapi"?: { method?: string } } } };
function writes(node: object, prefix: string): string[] {
  return Object.entries(node).flatMap(([name, value]) => {
    const path = `${prefix}.${name}`;
    const leaf = (value as Node)["~orpc"];
    if (!leaf) return writes(value as object, path);
    return leaf.meta["~openapi"]?.method === "GET" ? [] : [path];
  });
}

const auditOf = (projectId: string, action: string) =>
  database.query<{
    action: string;
    target_kind: string;
    target_id: string;
    actor_id: string;
    project_id: string;
  }>(
    `SELECT action, target_kind, target_id, actor_id, project_id FROM audit_log
      WHERE project_id = $1 AND action = $2 ORDER BY occurred_at`,
    [projectId, action],
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("idea : audit des écritures", () => {
  const p = () => scene.projects.p1;

  it("chaque écriture du groupe est soit auditée ici, soit documentée hors journal", () => {
    const audited = [
      "idea.save",
      "idea.setStatus",
      "idea.page.create",
      "idea.page.rename",
      "idea.page.reorder",
      "idea.page.delete",
      "idea.page.restore",
      "idea.proposal.decide",
      "idea.proposal.undo",
    ];
    expect(writes(contract.idea, "idea").sort()).toEqual(
      [...audited, ...UNAUDITED_HERE, ...AUDITED_ELSEWHERE].sort(),
    );
  });

  it("save, setStatus, create, rename, delete, restore : une entrée par appel, sur la page, par l'acteur", async () => {
    const api = ideaApi(app, scene.staff.dev);
    const vision = await pageIdOf(database, p(), "vision");
    await api.save(p(), vision, 1, "texte");
    await api.setStatus(p(), vision, "review");
    const created = await api.create(p(), "Audit");
    await api.rename(p(), created.body.id, "Audité");
    await api.remove(p(), created.body.id);
    await api.restore(p(), created.body.id);
    const expected: [string, string][] = [
      ["idea.page.save", vision],
      ["idea.page.status", vision],
      ["idea.page.create", created.body.id],
      ["idea.page.rename", created.body.id],
      ["idea.page.delete", created.body.id],
      ["idea.page.restore", created.body.id],
    ];
    for (const [action, targetId] of expected) {
      const rows = await auditOf(p(), action);
      expect(rows, action).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        target_kind: "idea_page",
        target_id: targetId,
        actor_id: scene.staff.dev.userId,
      });
    }
  });

  it("accepter, rejeter et annuler une proposition : une entrée par décision, sur la page ou le projet", async () => {
    const api = ideaAgentApi(app, scene.staff.dev);
    const s = { organizationId: scene.organizationId, projectId: p() };
    const page = await pageIdOf(database, p(), "utilisateurs");
    const accepted = await insertProposal(database, s, { pageId: page, baseVersion: 1 });
    const other = await pageIdOf(database, p(), "mesure");
    const rejected = await insertProposal(database, s, { pageId: other, baseVersion: 1 });
    const created = await insertProposal(database, s, { op: "create_page", title: "Audit agent" });
    expect((await api.decide(p(), accepted, "accept")).status).toBe(200);
    expect((await api.undo(p(), accepted)).status).toBe(200);
    expect((await api.decide(p(), rejected, "reject")).status).toBe(200);
    const made = await api.decide(p(), created, "accept");
    const expected: [string, string, string][] = [
      ["idea.proposal.accept", "idea_page", page],
      ["idea.proposal.accept", "idea_page", made.body.page.id],
      ["idea.proposal.undo", "idea_page", page],
      ["idea.proposal.reject", "idea_page", other],
    ];
    for (const [action, kind, targetId] of expected) {
      const rows = (await auditOf(p(), action)).filter((row) => row.target_id === targetId);
      expect(rows, `${action} ${targetId}`).toHaveLength(1);
      expect(rows[0]).toMatchObject({ target_kind: kind, actor_id: scene.staff.dev.userId });
    }
  });

  it("reorder : une entrée de projet", async () => {
    const api = ideaApi(app, scene.staff.admin);
    const ids = (await api.list(p())).body.pages.map((x: { id: string }) => x.id).reverse();
    expect((await api.reorder(p(), ids)).status).toBe(200);
    const rows = await auditOf(p(), "idea.page.reorder");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target_kind: "project", target_id: p() });
  });

  it("un refus (version périmée, page requise, rôle, projet inconnu) n'écrit aucune entrée", async () => {
    const count = async () =>
      (await database.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_log"))[0]?.n;
    const before = await count();
    const owner = ideaApi(app, scene.staff.owner);
    const vision = await pageIdOf(database, p(), "vision");
    expect((await owner.save(p(), vision, 99, "x")).status).toBe(409);
    expect((await owner.remove(p(), await pageIdOf(database, p(), "perimetre"))).status).toBe(403);
    expect((await ideaApi(app, scene.staff.business).save(p(), vision, 1, "x")).status).toBe(403);
    expect((await ideaApi(app, scene.c3).save(p(), vision, 1, "x")).status).toBe(404);
    expect((await owner.create(randomUUID(), "x")).status).toBe(404);
    expect(await count()).toBe(before);
  });

  it("la présence n'écrit rien dans l'audit", async () => {
    const before = await database.query(
      "SELECT 1 FROM audit_log WHERE action LIKE 'idea.%' AND actor_id = $1",
      [scene.staff.designer.userId],
    );
    await ideaApi(app, scene.staff.designer).presence(p());
    const after = await database.query(
      "SELECT 1 FROM audit_log WHERE action LIKE 'idea.%' AND actor_id = $1",
      [scene.staff.designer.userId],
    );
    expect(after).toHaveLength(before.length);
  });
});
