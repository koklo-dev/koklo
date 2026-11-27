import { FakeLlm } from "@koklo/domain/testing";
import { SECRET_REFUSAL_MESSAGE } from "@koklo/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installAiBench, setKey } from "./helpers/ai-bench.ts";
import { insertProposal, proposalApi } from "./helpers/proposals.ts";
import { batch, batchApi, batchRows } from "./helpers/spec-batch.ts";
import { readScene } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-115 lot B (cas 4, B724) : la spec ne contient jamais de valeur de secret. L'API refuse (422) avant toute écriture, sans
 * recopier la valeur, dans un lot (charges et message), dans une proposition corrigée, dans la correction de l'agent et
 * retire le champ d'un préremplissage. Les valeurs sont fabriquées à l'exécution.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });
const SECRET = `ghp_${"x".repeat(36)}`;
const KEY = `-----BEGIN ${"PRIVATE KEY"}-----`;

const ENV = {
  kind: "env.create",
  name: "Recette",
  address: "recette.exemple.fr",
  hosting: "Paris",
  database: "PostgreSQL",
  data: "sample",
};
const STACK = {
  kind: "stack.create",
  role: "Base",
  status: "open",
  options: ["A", "B"],
  why: "x",
};

const CASES: [string, unknown[], Record<string, unknown>, string][] = [
  ["stack.create", [{ ...STACK, why: `Jeton ${SECRET}` }], {}, "operations.0.why"],
  [
    "env.create",
    [ENV, { ...ENV, name: "Prod", variables: [{ name: "KEY", usage: KEY }] }],
    {},
    "operations.1.variables.0.usage",
  ],
  [
    "doc.section.update",
    [
      {
        kind: "doc.section.update",
        specId: "DOC-objet",
        deliverable: "technical",
        markdown: `postgres://app:${"m".repeat(12)}@base/appli`,
      },
    ],
    {},
    "operations.0.markdown",
  ],
  ["message du lot", [STACK], { message: `clé ${SECRET}` }, "message"],
  [
    "feature.create",
    [{ kind: "feature.create", title: SECRET, priority: "must" }],
    {},
    "operations.0.title",
  ],
];

describe("specBatch.submit refuse une valeur de secret", () => {
  it.each(CASES)(
    "%s : 422 sans la valeur, aucune ligne",
    async (_name, operations, over, field) => {
      const b = bench();
      const scene = await readScene(b);
      const res = await batchApi(b.app, scene.world.actors.dev).submit(
        scene.projectId,
        batch(operations, over),
      );
      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(res.body).toMatchObject({
        code: "VALIDATION",
        data: { field, message: SECRET_REFUSAL_MESSAGE },
      });
      expect(JSON.stringify(res.body)).not.toContain(SECRET);
      expect(JSON.stringify(res.body)).not.toContain("mmmmmmmm");
      expect(await batchRows(b.database, scene.projectId)).toHaveLength(0);
      expect(b.queue.enqueued).toHaveLength(0);
      expect(b.lines.join("")).not.toContain(SECRET);
    },
  );
});

const CONTENT = {
  role: "Base",
  components: [],
  status: "open",
  options: ["A", "B"],
  criteria: [],
  why: "x",
  requirements: [],
  decisions: [],
};

async function pendingStack() {
  const b = bench();
  const scene = await readScene(b);
  await setKey(b.app, scene.world, "FAKE-KEY-NOT-REAL-0115");
  const proposal = await insertProposal(b.database, scene, {
    kind: "stack",
    deliverable: "technical",
    payload: CONTENT,
    title: "Base",
  });
  return { b, scene, ...proposal };
}

const payloadOf = async (id: string) => {
  const [row] = await bench().database.query<{ payload: object; status: string }>(
    "SELECT payload, status FROM agent_proposals WHERE id = $1",
    [id],
  );
  return row;
};

describe("propositions et préremplissage", () => {
  it("proposal.decide corrigé avec un secret : 422 sans la valeur, proposition inchangée", async () => {
    const { b, scene, id } = await pendingStack();
    const res = await proposalApi(b.app, scene.world.actors.dev).decide(
      scene.projectId,
      id,
      "accept",
      { edited: { ...CONTENT, why: SECRET } },
    );
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.data).toEqual({ field: "edited", message: SECRET_REFUSAL_MESSAGE });
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect(await payloadOf(id)).toEqual({ payload: CONTENT, status: "pending" });
  });

  it("ai.reviseProposal : une sortie qui porte un secret est refusée, jamais enregistrée", async () => {
    const { b, scene, id } = await pendingStack();
    b.use(FakeLlm.replying({ ...CONTENT, why: SECRET }));
    const res = await proposalApi(b.app, scene.world.actors.dev).revise(scene.projectId, id);
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect((await payloadOf(id))?.payload).toEqual(CONTENT);
  });

  it("ai.prefillItem : le champ qui porte un secret est retiré, les autres restent", async () => {
    const { b, scene } = await pendingStack();
    b.use(FakeLlm.replying({ name: "Démo", access: `Jeton ${SECRET}`, hosting: "Paris" }));
    const res = await send(
      b.app,
      scene.world.actors.dev.cookie,
      "post",
      `/projects/${scene.projectId}/ai/item/prefill`,
      { projectId: scene.projectId, type: "environment", description: "Un environnement de démo" },
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ type: "environment", values: { name: "Démo", hosting: "Paris" } });
  });
});
