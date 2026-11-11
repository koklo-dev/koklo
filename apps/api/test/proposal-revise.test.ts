import { randomUUID } from "node:crypto";
import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_BUDGETS } from "../src/ai/ai-budget.ts";
import { installAiBench, keyedWorld } from "./helpers/ai-bench.ts";
import { auditRowsFull } from "./helpers/comments.ts";
import { FEATURE_CONTENT, insertProposal, proposalApi } from "./helpers/proposals.ts";

/**
 * TK-99a (cas 6, 8) : `ai.reviseProposal`. Appel synchrone par le moteur partagé : une proposition entre, une
 * proposition sort, au texte brut ; elle reste `pending` et n'est jamais écrite dans la spec.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

const REVISED = { ...FEATURE_CONTENT, title: "Annuler en un geste", description: "Plus court." };
const rowOf = async (b: ReturnType<typeof bench>, id: string) =>
  (
    await b.database.query<{ title: string; status: string; payload: { title: string } }>(
      "SELECT title, status, payload FROM agent_proposals WHERE id = $1",
      [id],
    )
  )[0];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("ai.reviseProposal", () => {
  it("200 : la proposition révisée, toujours en attente ; le prompt cadre le contenu et la consigne ; une ligne d'audit", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { id } = await insertProposal(b.database, world, { status: "accepted" });
    const fake = FakeLlm.replying(REVISED);
    b.use(fake);

    const res = await proposalApi(b.app, world.actors.dev).revise(world.projectId, id, {
      instruction: "Plus court, merci",
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      id,
      title: "Annuler en un geste",
      status: "pending",
      content: REVISED,
    });
    expect(await rowOf(b, id)).toMatchObject({ title: "Annuler en un geste", status: "pending" });
    const [call] = fake.calls;
    expect(call?.trace.purpose).toBe("proposal-revise");
    expect(call?.budget).toEqual(AI_BUDGETS["proposal-revise"]);
    expect(call?.prompt.user).toContain("Plus court, merci");
    expect(call?.prompt.user).toContain("Annuler une réservation");
    const rows = (await auditRowsFull(b.database, world.organizationId)).filter(
      (r) => r.action === "ai.proposal.revise",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target_kind: "agent_proposal", target_id: id });
    const [batches] = await b.database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM spec_write_batches WHERE project_id = $1",
      [world.projectId],
    );
    expect(batches?.n).toBe(0);
  });

  it("texte avec lien, balise ou caractère de direction : LLM_OUTPUT_INVALID, la proposition est inchangée", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { id } = await insertProposal(b.database, world);
    for (const description of [
      "Voir https://exemple.fr",
      "<a href=x>clic</a>",
      "[x](http://y.fr)",
      "texte‮caché",
    ]) {
      b.use(FakeLlm.replying({ ...REVISED, description }));
      const res = await proposalApi(b.app, world.actors.dev).revise(world.projectId, id);
      expect(res.body.code, description).toBe("LLM_OUTPUT_INVALID");
      expect(res.status, description).toBeGreaterThanOrEqual(400);
    }
    expect((await rowOf(b, id))?.title).toBe("Annuler une réservation");
  });

  it("sortie hors schéma (champ inconnu, critères mal ordonnés) : LLM_OUTPUT_INVALID", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { id } = await insertProposal(b.database, world);
    b.use(FakeLlm.replying({ ...REVISED, extra: "non" }));
    expect((await proposalApi(b.app, world.actors.dev).revise(world.projectId, id)).body.code).toBe(
      "LLM_OUTPUT_INVALID",
    );
  });

  it("proposition appliquée : 409 CONFLICT sans appel au modèle ; inconnue ou d'un autre projet : 404", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { id } = await insertProposal(b.database, world, { status: "accepted" });
    await b.database.query("UPDATE agent_proposals SET applied_batch_id = $2 WHERE id = $1", [
      id,
      randomUUID(),
    ]);
    const fake = FakeLlm.replying(REVISED);
    b.use(fake);
    const api = proposalApi(b.app, world.actors.dev);
    expect((await api.revise(world.projectId, id)).status).toBe(409);
    expect((await api.revise(world.projectId, randomUUID())).status).toBe(404);
    const other = await keyedWorld(b);
    expect(
      (await proposalApi(b.app, other.world.actors.dev).revise(other.world.projectId, id)).status,
    ).toBe(404);
    expect(fake.calls).toHaveLength(0);
  });

  it("client et business : 403 sans appel au modèle ; consigne vide ou trop longue : 400", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { id } = await insertProposal(b.database, world);
    const fake = FakeLlm.replying(REVISED);
    b.use(fake);
    for (const role of ["client", "business"] as const) {
      expect(
        (await proposalApi(b.app, world.actors[role]).revise(world.projectId, id)).status,
        role,
      ).toBe(403);
    }
    const api = proposalApi(b.app, world.actors.dev);
    expect((await api.revise(world.projectId, id, { instruction: "" })).status).toBe(400);
    expect((await api.revise(world.projectId, id, { instruction: "x".repeat(501) })).status).toBe(
      400,
    );
    expect(fake.calls).toHaveLength(0);
  });
});
