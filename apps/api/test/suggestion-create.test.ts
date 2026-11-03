import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { count } from "./helpers/organizations.ts";
import { auditOf } from "./helpers/project-client.ts";
import { installBench } from "./helpers/repo-scene.ts";
import {
  createSuggestionScene,
  type SuggestionScene,
  suggestionApi,
  suggestionRows,
} from "./helpers/suggestions.ts";
import { insertProject } from "./helpers/tickets.ts";

/**
 * TK-55c : `suggestion.create`. La clé `SG-n` vient du compteur transactionnel, l'auteur, son rôle,
 * le SHA de base et le statut sont posés par le serveur. Idempotence d'un doublon ouvert, quotas en
 * base, `framing_closed` après la baseline taguée, atomicité avec l'audit.
 */
const bench = installBench({ beforeAll, afterAll, beforeEach });
let scene: SuggestionScene;
beforeEach(async () => {
  scene = await createSuggestionScene(bench());
});

const p1 = () => scene.p1.projectId;
const client = () => suggestionApi(bench().app, scene.c1);
const as = (role: "owner" | "admin" | "dev" | "designer") =>
  suggestionApi(bench().app, scene.p1.world.actors[role]);
const rows = () => suggestionRows(bench().database, p1());
const CLIENT_KEYS = [
  "body",
  "createdAt",
  "decidedAt",
  "decisionNote",
  "id",
  "key",
  "mine",
  "outdated",
  "status",
  "targetKind",
  "targetRef",
].sort();

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("création nominale", () => {
  it("client, cible projet : 200, clés exactes sans authorRole, ligne posée par le serveur", async () => {
    const res = await client().create(p1(), { body: "Un tableau de bord" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(CLIENT_KEYS);
    expect(res.body).toMatchObject({
      key: "SG-1",
      targetKind: "project",
      targetRef: null,
      body: "Un tableau de bord",
      status: "open",
      decisionNote: null,
      decidedAt: null,
      mine: true,
      outdated: false,
    });
    const [row] = await rows();
    expect(row).toMatchObject({
      id: res.body.id,
      key: "SG-1",
      organization_id: scene.p1.organizationId,
      author_user_id: scene.c1.userId,
      author_role: "client",
      status: "open",
      decided_by_user_id: null,
      decision_note: null,
      target_kind: "project",
      target_ref: null,
      base_sha: scene.headP1,
    });
  });

  it("cible feature : targetRef conservé, base_sha = tête courante de la spec", async () => {
    const res = await client().createFeature(p1(), "F-001");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ targetKind: "feature", targetRef: "F-001" });
    const [row] = await rows();
    expect(row).toMatchObject({
      target_kind: "feature",
      target_ref: "F-001",
      base_sha: scene.headP1,
    });
  });

  it("l'équipe reçoit authorRole ; le rôle stocké est celui de la session", async () => {
    const res = await as("dev").create(p1());

    expect(res.status).toBe(200);
    expect(res.body.authorRole).toBe("dev");
    expect((await rows())[0]?.author_role).toBe("dev");
  });

  it("une entrée forgée (clé, statut, SHA, auteur, rôle) n'est jamais lue", async () => {
    const res = await client().create(p1(), {
      key: "SG-99",
      status: "accepted",
      baseSha: "f".repeat(40),
      base_sha: "f".repeat(40),
      authorRole: "owner",
      authorUserId: scene.c2.userId,
      organizationId: scene.foreign.organizationId,
      decidedBy: scene.c2.userId,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [row] = await rows();
    expect(row).toMatchObject({
      key: "SG-1",
      status: "open",
      base_sha: scene.headP1,
      author_role: "client",
      author_user_id: scene.c1.userId,
      organization_id: scene.p1.organizationId,
      decided_by_user_id: null,
    });
  });

  it("projet sans spec indexée : cible projet 200 avec base_sha NULL, cible feature 404", async () => {
    const empty = await insertProject(bench().database, scene.p1.organizationId, "Sans spec");

    const project = await as("owner").create(empty);
    const feature = await as("owner").createFeature(empty, "F-001");

    expect(project.status, JSON.stringify(project.body)).toBe(200);
    expect((await suggestionRows(bench().database, empty))[0]?.base_sha).toBeNull();
    expect(feature.status).toBe(404);
    expect(feature.body.code).toBe("NOT_FOUND");
  });
});

describe("cible inexistante : NOT_FOUND, jamais de cible pendante", () => {
  it.each([
    ["feature absente de la spec", "F-999"],
    ["feature d'un autre projet (F-009 n'existe que dans p2)", "F-009"],
  ])("%s", async (_label, targetRef) => {
    const res = await client().createFeature(p1(), targetRef);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(await rows()).toHaveLength(0);
    expect((await client().create(p1())).body.key, "aucune clé consommée").toBe("SG-1");
  });
});

describe("validation : 422 VALIDATION, jamais 500", () => {
  it.each([
    ["feature sans targetRef", { targetKind: "feature" }],
    ["projet avec targetRef", { targetKind: "project", targetRef: "F-001" }],
    ["targetRef mal formé", { targetKind: "feature", targetRef: "F-1" }],
    ["écran (non exposé)", { targetKind: "screen", targetRef: "S-home" }],
    ["corps vide", { body: "" }],
    ["corps d'espaces", { body: "   " }],
    ["corps de 5001 caractères", { body: "x".repeat(5001) }],
    ["octet NUL", { body: "a\u0000b" }],
    ["caractère de contrôle", { body: "a\u0007b" }],
    ["substitut UTF-16 isolé", { body: "a\ud800b" }],
  ])("%s", async (_label, over) => {
    const res = await client().create(p1(), over);

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe("VALIDATION");
    expect(await rows()).toHaveLength(0);
  });

  it("5000 caractères exactement : accepté", async () => {
    expect((await client().create(p1(), { body: "x".repeat(5000) })).status).toBe(200);
  });
});

describe("clé SG-n par le compteur transactionnel", () => {
  it("clés consécutives par projet, indépendantes d'un projet à l'autre", async () => {
    const keys = [];
    for (const body of ["un", "deux", "trois"])
      keys.push((await client().create(p1(), { body })).body.key);
    const other = await suggestionApi(bench().app, scene.c2).create(scene.p2.projectId);

    expect(keys).toEqual(["SG-1", "SG-2", "SG-3"]);
    expect(other.body.key).toBe("SG-1");
  });

  it("20 créations parallèles : 20 clés distinctes et consécutives, 20 entrées d'audit", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, n) => as("dev").create(p1(), { body: `parallèle ${n}` })),
    );

    expect(results.map((res) => res.status)).toEqual(Array(20).fill(200));
    const keys = (await rows()).map((row) => Number(row.key.slice(3))).sort((a, b) => a - b);
    expect(keys).toEqual(Array.from({ length: 20 }, (_, n) => n + 1));
    const audit = await auditOf(bench().database, scene.p1.organizationId, ["suggestion.create"]);
    expect(audit).toHaveLength(20);
  });
});

describe("idempotence : un doublon ouvert (même auteur, cible, corps) est renvoyé tel quel", () => {
  it("rejeu : 200, même id, aucune ligne, clé, audit ni notification en plus", async () => {
    const first = await client().create(p1(), { body: "Même idée" });
    const db = bench().database;
    const before = [
      await count(db, "notifications"),
      (await auditOf(db, scene.p1.organizationId, ["suggestion.create"])).length,
    ];

    const again = await client().create(p1(), { body: "Même idée" });

    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await rows()).toHaveLength(1);
    expect([
      await count(db, "notifications"),
      (await auditOf(db, scene.p1.organizationId, ["suggestion.create"])).length,
    ]).toEqual(before);
    expect((await client().create(p1(), { body: "Autre" })).body.key, "clé non consommée").toBe(
      "SG-2",
    );
  });

  it("double clic parallèle : une seule suggestion, la même réponse partout", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => client().create(p1(), { body: "Double clic" })),
    );

    expect(results.map((res) => res.status)).toEqual(Array(5).fill(200));
    expect(new Set(results.map((res) => res.body.id)).size).toBe(1);
    expect(await rows()).toHaveLength(1);
  });

  it("corps, cible ou auteur différent : nouvelle suggestion ; doublon d'une suggestion retirée : aussi", async () => {
    const first = await client().create(p1(), { body: "Idée" });
    await client().create(p1(), { body: "Idée autre" });
    await as("dev").create(p1(), { body: "Idée" });
    await client().createFeature(p1(), "F-001", { body: "Idée" });
    await client().withdraw(p1(), first.body.id);

    const afterWithdraw = await client().create(p1(), { body: "Idée" });

    expect(afterWithdraw.body.id).not.toBe(first.body.id);
    expect(await rows()).toHaveLength(5);
  });
});
