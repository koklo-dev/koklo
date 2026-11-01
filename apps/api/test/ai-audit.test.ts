import { FakeLlm } from "@koklo/domain/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AI_ACTIONS,
  aiApi,
  aiAuditRows,
  allAuditText,
  BRIEF_REPLY,
  credentialState,
  featuresReply,
  GatedLlm,
  installAiBench,
  keyedWorld,
} from "./helpers/ai-bench.ts";
import { readScene, seedIndex } from "./helpers/spec-read.ts";

/**
 * TK-54b (CDC §15) : une ligne d'audit par appel, écrite AVANT l'appel au modèle (une dépense
 * tentée est tracée même si l'appel échoue), jamais de contenu. Le réseau n'est jamais dans une
 * transaction. Le scénario de complétude vit dans audit-coverage.test.ts.
 */
const bench = installAiBench({ beforeAll, afterAll, beforeEach });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("une ligne par appel : action, cible, acteur", () => {
  it("draftBrief : ai.brief.draft sur le projet, acteur = utilisateur de la session", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));

    await aiApi(b.app, world.actors.designer).draftBrief(world.projectId);

    const rows = await aiAuditRows(b.database, world.organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: AI_ACTIONS.draftBrief,
      target_kind: "project",
      target_id: world.projectId,
      actor_id: world.actors.designer.userId,
    });
  });

  it("proposeFeatures : ai.features.propose sur le projet", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(featuresReply()));

    await aiApi(b.app, world.actors.dev).proposeFeatures(world.projectId);

    expect(await aiAuditRows(b.database, world.organizationId)).toMatchObject([
      { action: AI_ACTIONS.proposeFeatures, target_kind: "project", target_id: world.projectId },
    ]);
  });

  it("proposeCriteria : ai.criteria.propose sur le projet", async () => {
    const b = bench();
    const scene = await readScene(b);
    await seedIndex(b, scene, [{ id: "F-001", titre: "Connexion" }], { commit: true });
    const { setKey } = await import("./helpers/ai-bench.ts");
    await setKey(b.app, scene.world, "FAKE-KEY-NOT-REAL-0701");
    b.use(
      FakeLlm.replying({
        criteria: [
          {
            title: "t",
            steps: [
              { type: "etant_donne", text: "a" },
              { type: "quand", text: "b" },
              { type: "alors", text: "c" },
            ],
          },
        ],
      }),
    );

    const res = await aiApi(b.app, scene.world.actors.dev).proposeCriteria(scene.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await aiAuditRows(b.database, scene.organizationId)).toMatchObject([
      { action: AI_ACTIONS.proposeCriteria, target_kind: "project", target_id: scene.projectId },
    ]);
  });

  it("verify : llm_credential.verify sur la ligne de la clé", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying("OK"));

    await aiApi(b.app, world.actors.owner).verify();

    const state = await credentialState(b.database, world.organizationId);
    expect(await aiAuditRows(b.database, world.organizationId)).toMatchObject([
      {
        action: AI_ACTIONS.verify,
        target_kind: "llm_credential",
        target_id: state?.id,
        actor_id: world.actors.owner.userId,
      },
    ]);
  });

  it("audit.list restitue les lignes ai.* pour un owner", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(BRIEF_REPLY));
    await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);
    const { send } = await import("./helpers/tickets.ts");

    const listed = await send(
      b.app,
      world.actors.owner.cookie,
      "get",
      `/audit?action=${AI_ACTIONS.draftBrief}`,
    );

    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toMatchObject({
      action: AI_ACTIONS.draftBrief,
      targetKind: "project",
      targetId: world.projectId,
    });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("écrite AVANT l'appel au modèle", () => {
  it("quand le modèle est appelé, la ligne existe déjà (et le réseau n'est pas dans une transaction)", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const gated = new GatedLlm(FakeLlm.replying(BRIEF_REPLY));
    let rowsAtCall = -1;
    let openTransactions = -1;
    gated.onCall = async () => {
      rowsAtCall = (await aiAuditRows(b.database, world.organizationId)).length;
      const { openTransactions: count } = await import("./helpers/repos.ts");
      openTransactions = await count(b.database);
    };
    gated.release();
    b.use(gated);

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(rowsAtCall).toBe(1);
    expect(openTransactions).toBe(0);
  });

  it("la ligne reste quand le fournisseur échoue (dépense tentée = dépense tracée)", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const { LlmTimeoutError } = await import("@koklo/domain");
    b.use(FakeLlm.failing(new LlmTimeoutError({ operation: "complete" })));

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(502);
    expect(await aiAuditRows(b.database, world.organizationId)).toHaveLength(1);
  });

  it("la ligne reste quand la sortie est invalide", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying({ n: "importe quoi" }));

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(502);
    expect(await aiAuditRows(b.database, world.organizationId)).toHaveLength(1);
  });

  it("audit en échec : l'appel échoue (500 INTERNAL) et le modèle n'est JAMAIS appelé", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const fake = FakeLlm.replying(BRIEF_REPLY);
    b.use(fake);
    await b.database.query("INSERT INTO audit_fail (action) VALUES ($1)", [AI_ACTIONS.draftBrief]);

    const res = await aiApi(b.app, world.actors.dev).draftBrief(world.projectId);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL");
    expect(fake.calls).toHaveLength(0);
    expect((await credentialState(b.database, world.organizationId))?.last_used_at).toBeNull();
  });

  it("verify : audit en échec = aucun appel", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const fake = FakeLlm.replying("OK");
    b.use(fake);
    await b.database.query("INSERT INTO audit_fail (action) VALUES ($1)", [AI_ACTIONS.verify]);

    const res = await aiApi(b.app, world.actors.owner).verify();

    expect(res.status).toBe(500);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("aucune ligne quand rien n'est dépensé", () => {
  it("clé absente, collision de délimiteur, entrée invalide, projet inconnu : aucune ligne en plus de celle de l'appel valide", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    b.use(FakeLlm.replying(featuresReply()));
    const api = aiApi(b.app, world.actors.dev);
    const valid = await api.proposeFeatures(world.projectId);
    expect(valid.status, JSON.stringify(valid.body)).toBe(200);

    const refusals = [
      await api.proposeFeatures(world.projectId, { brief: "<<<DATA" }),
      await api.proposeFeatures(world.projectId, { brief: "" }),
      await api.proposeFeatures("00000000-0000-4000-8000-000000000000"),
      await api.proposeFeatures(world.projectId, { maxFeatures: 99 }),
    ];

    expect(refusals.map((res) => res.status)).toEqual([422, 422, 404, 422]);
    expect(await aiAuditRows(b.database, world.organizationId)).toHaveLength(1);
  });
});

describe("aucun contenu dans l'audit", () => {
  it("ni brief, ni idée, ni titres, ni sortie du modèle, ni modèle servi ne figurent dans audit_log", async () => {
    const b = bench();
    const { world } = await keyedWorld(b);
    const idea = "IDEE-SENTINELLE-AUDIT-91";
    const brief = "BRIEF-SENTINELLE-AUDIT-92";
    const output = "SORTIE-SENTINELLE-AUDIT-93";
    b.use(
      new FakeLlm().script([
        { reply: { ...BRIEF_REPLY, title: output } },
        {
          reply: featuresReply({
            title: output,
            priority: "must",
            description: output,
            criteria: [
              {
                title: output,
                steps: [
                  { type: "etant_donne", text: output },
                  { type: "quand", text: output },
                  { type: "alors", text: output },
                ],
              },
            ],
          }),
        },
        { reply: "OK" },
      ]),
    );
    const dev = aiApi(b.app, world.actors.dev);

    await dev.draftBrief(world.projectId, { idea, answers: [idea] });
    await dev.proposeFeatures(world.projectId, { brief });
    await aiApi(b.app, world.actors.owner).verify();

    const text = await allAuditText(b.database, world.organizationId);
    for (const sentinel of [idea, brief, output, "ping", "FAKE-KEY"]) {
      expect(text, sentinel).not.toContain(sentinel);
    }
    expect(await aiAuditRows(b.database, world.organizationId)).toHaveLength(3);
  });

  it("les lignes d'audit n'ont que les colonnes habituelles (aucune colonne de contenu ajoutée)", async () => {
    const b = bench();
    const columns = await b.database.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_log' ORDER BY column_name",
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      "action",
      "actor_id",
      "actor_kind",
      "id",
      "occurred_at",
      "organization_id",
      "target_id",
      "target_kind",
      "ticket_id",
      "token_id",
    ]);
  });
});
