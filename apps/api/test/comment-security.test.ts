import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commentRows, commentsFor } from "./helpers/comments.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { securityScene, summaryEntity, threatEntity } from "./helpers/spec-security.ts";
import { linkClient, send } from "./helpers/tickets.ts";

/**
 * TK-117 lot B (B802) : une seule cible de commentaire pour la Sécurité, le résumé client. Le client pose sa question,
 * l'équipe la lit ; le business ne commente pas ; sans résumé indexé, la cible n'existe pas.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });

async function scene(withSummary = true) {
  const s = await securityScene(bench(), [
    threatEntity("SEC-T01"),
    ...(withSummary ? [summaryEntity()] : []),
  ]);
  await linkClient(bench().database, s.organizationId, s.projectId, s.world.actors.client.userId);
  const create = (role: keyof typeof s.world.actors, over: Record<string, unknown> = {}) =>
    send(bench().app, s.world.actors[role].cookie, "post", `/projects/${s.projectId}/comments`, {
      projectId: s.projectId,
      targetKind: "security_summary",
      targetRef: "summary",
      body: "Qui voit les notes ?",
      ...over,
    });
  return { s, create };
}

describe("commentaires sur le résumé de la Sécurité", () => {
  it("le client pose sa question, l'équipe la lit ; le client ne liste pas", async () => {
    const { s, create } = await scene();
    const res = await create("client");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ targetKind: "security_summary", authorKind: "client" });
    const [row] = await commentRows(bench().database, s.organizationId);
    expect(row).toMatchObject({ target_kind: "security_summary", target_ref: "summary" });
    const list = (role: keyof typeof s.world.actors) =>
      commentsFor(bench().app, s.world.actors[role], s.projectId).list(
        s.projectId,
        "targetRef=summary",
        "security_summary",
      );
    expect(
      (await commentsFor(bench().app, s.world.actors.client, s.projectId).listOnTable("T-x"))
        .status,
    ).toBe(403);
    const team = await send(
      bench().app,
      s.world.actors.dev.cookie,
      "get",
      `/projects/${s.projectId}/comments?targetKind=security_summary&targetRef=summary`,
    );
    expect(team.status, JSON.stringify(team.body)).toBe(200);
    expect(team.body.items).toHaveLength(1);
    expect((await list("business")).status).toBe(403);
  });

  it("business : 403 ; autre référence : refusée ; résumé absent : 404", async () => {
    const { create } = await scene();
    expect((await create("business")).status).toBe(403);
    expect((await create("client", { targetRef: "SEC-T01" })).status).toBe(422);
    const bare = await scene(false);
    expect((await bare.create("client")).status).toBe(404);
  });
});
