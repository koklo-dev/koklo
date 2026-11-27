import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench, setKey } from "./helpers/ai-bench.ts";
import { insertProposal, proposalApi } from "./helpers/proposals.ts";
import { batchApi } from "./helpers/spec-batch.ts";
import { entryEntity, securityScene, tableEntity } from "./helpers/spec-security.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-117 lot B (cas 4, A7, B796) : aucune conservation ne vient de l'agent. Une proposition qui en porte une est
 * refusée, un lot de propositions n'en écrit pas, le préremplissage la retire ; seule une saisie humaine la pose.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

const PROPOSAL = {
  data: "Note",
  fields: ["clientes.note"],
  category: "sensitive",
  access: ["Accueil"],
  retentionSuggestion: "1 an",
};

async function scene() {
  const b = bench();
  const s = await securityScene(b, [tableEntity("clientes", ["note"]), entryEntity("t.a")]);
  const scope = { organizationId: s.organizationId, projectId: s.projectId };
  const proposal = await insertProposal(b.database, scope, {
    deliverable: "security",
    kind: "sensitive",
    payload: PROPOSAL,
  });
  return { b, s, proposal };
}

describe("A7 : conservation et agent", () => {
  it("décider avec une conservation ajoutée : 422, proposition inchangée", async () => {
    const { b, s, proposal } = await scene();
    const api = proposalApi(b.app, s.world.actors.dev);
    const edited = await api.decide(s.projectId, proposal.id, "accept", {
      edited: { ...PROPOSAL, retention: "3 ans" },
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(422);
    expect((await api.decide(s.projectId, proposal.id, "accept")).status).toBe(200);
  });

  it("un lot de propositions ne pose jamais de conservation ; sans elle, il part", async () => {
    const { b, s, proposal } = await scene();
    await proposalApi(b.app, s.world.actors.dev).decide(s.projectId, proposal.id, "accept");
    const submit = (key: string, over: Record<string, unknown>) =>
      batchApi(b.app, s.world.actors.dev).submit(s.projectId, {
        idempotencyKey: key,
        proposalIds: [proposal.id],
        operations: [{ kind: "sensitive.create", ...PROPOSAL, ...over }],
      });
    const refused = await submit("a7-1", { retention: "1 an" });
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body.data.field).toBe("operations.0.retention");
    const kept = await submit("a7-2", {});
    expect(kept.status, JSON.stringify(kept.body)).toBe(200);
  });

  it("préremplissage : la conservation rendue par le modèle est retirée", async () => {
    const { b, s } = await scene();
    await setKey(b.app, s.world, "FAKE-KEY-NOT-REAL-0117");
    b.use(
      FakeLlm.replying({
        field: "clientes.note",
        category: "sensitive",
        retention: "3 ans",
        conservation: "3 ans",
        retentionSuggestion: "1 an",
      }),
    );
    const res = await send(
      b.app,
      s.world.actors.dev.cookie,
      "post",
      `/projects/${s.projectId}/ai/item/prefill`,
      { projectId: s.projectId, type: "sensitive", description: "La note des coiffeuses" },
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.values).toEqual({
      field: "clientes.note",
      category: "sensitive",
      retentionSuggestion: "1 an",
    });
  });
});
