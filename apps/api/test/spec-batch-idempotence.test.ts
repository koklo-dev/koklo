import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditCount,
  BRANCH,
  batchApi,
  batchRows,
  commitsOf,
  createOp,
  headOf,
  installSpecBench,
  specScene,
  updateOp,
} from "./helpers/spec-batch.ts";

/** TK-44b §5 : idempotence par clé (rejeu = même lot, sans nouveau commit ni audit). */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });
const ACTION = "spec.batch.submit";

describe("rejeu d'une clé d'idempotence", () => {
  it("rend le même lot (id, F-nnn, commit) sans nouveau commit ni nouvelle entrée d'audit", async () => {
    const b = bench();
    const s = await specScene(b);
    const api = batchApi(b.app, s.world.actors.dev);
    const body = { idempotencyKey: "rejeu-1", branch: BRANCH, operations: [createOp("Une fois")] };

    const first = await api.submit(s.projectId, body);
    const commits = (await commitsOf(b, s)).length;
    b.harness.calls = [];
    const second = await api.submit(s.projectId, body);

    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(second.body).toEqual(first.body);
    expect((await commitsOf(b, s)).length).toBe(commits);
    expect(b.harness.callsOf("writeCommit")).toEqual([]);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(1);
    expect(await auditCount(b.database, s.world.organizationId, ACTION)).toBe(1);
  });

  it("le rejeu par un autre membre du projet (même contenu) rend aussi le même lot", async () => {
    const b = bench();
    const s = await specScene(b);
    const body = { idempotencyKey: "rejeu-2", branch: BRANCH, operations: [createOp("Partagé")] };

    const first = await batchApi(b.app, s.world.actors.dev).submit(s.projectId, body);
    const second = await batchApi(b.app, s.world.actors.admin).submit(s.projectId, body);

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await auditCount(b.database, s.world.organizationId, ACTION)).toBe(1);
  });
});

describe("rejeu d'une clé d'idempotence (suite 2)", () => {
  it("deux soumissions simultanées de la même clé produisent un seul lot et un seul commit", async () => {
    const b = bench();
    const s = await specScene(b);
    const api = batchApi(b.app, s.world.actors.dev);
    const body = { idempotencyKey: "course", branch: BRANCH, operations: [createOp("Course")] };
    const commits = (await commitsOf(b, s)).length;
    b.gate.delayMs = 150;

    const [first, second] = await Promise.all([
      api.submit(s.projectId, body),
      api.submit(s.projectId, body),
    ]);

    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(1);
    expect((await commitsOf(b, s)).length).toBe(commits + 1);
    expect(await auditCount(b.database, s.world.organizationId, ACTION)).toBe(1);
  });

  it("le rejeu rend les mêmes F-nnn (jamais réattribués) et ne fait pas avancer le compteur", async () => {
    const b = bench();
    const s = await specScene(b);
    const api = batchApi(b.app, s.world.actors.dev);
    const body = {
      idempotencyKey: "stable",
      branch: BRANCH,
      operations: [createOp("A"), createOp("B")],
    };
    const counter = () =>
      b.database.query<{ last_value: number }>(
        "SELECT last_value FROM project_counters WHERE project_id = $1 AND name = 'feature'",
        [s.projectId],
      );

    const first = await api.submit(s.projectId, body);
    const after = await counter();
    const second = await api.submit(s.projectId, body);

    expect(second.body.results).toEqual(first.body.results);
    expect(await counter()).toEqual(after);
    expect(after[0]?.last_value).toBe(2);
  });
});

describe("clé réutilisée avec un autre contenu", () => {
  const variants: [string, Record<string, unknown>][] = [
    ["autres opérations", { operations: [createOp("Différent")] }],
    ["autre message", { message: "autre message" }],
    ["autre branche", { branch: "autre-branche" }],
    [
      "autre ordre des opérations",
      { operations: [updateOp("F-101", { title: "x" }), createOp("Une")] },
    ],
  ];

  it.each(variants)(
    "%s : SPEC_BATCH_CONFLICT idempotency_key_reused avec le batchId d'origine",
    async (_name, over) => {
      const b = bench();
      const s = await specScene(b);
      const api = batchApi(b.app, s.world.actors.dev);
      const base = {
        idempotencyKey: "reutilisee",
        branch: BRANCH,
        message: "message d'origine",
        operations: [createOp("Une"), updateOp("F-101", { title: "x" })],
      };
      const first = await api.submit(s.projectId, base);
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      const commits = (await commitsOf(b, s)).length;
      const head = await headOf(b, s);

      const second = await api.submit(s.projectId, { ...base, ...over });

      expect(second.status).toBe(409);
      expect(second.body.code).toBe("SPEC_BATCH_CONFLICT");
      expect(second.body.data).toEqual({
        reason: "idempotency_key_reused",
        batchId: first.body.id,
      });
      expect((await commitsOf(b, s)).length).toBe(commits);
      expect(await headOf(b, s)).toBe(head);
      expect(await batchRows(b.database, s.projectId)).toHaveLength(1);
      expect(await auditCount(b.database, s.world.organizationId, ACTION)).toBe(1);
    },
  );
});

describe("lot terminé en échec : il ne se rejoue pas", () => {
  it("SPEC_INVALID rejoué sous la même clé : même erreur et même rapport, aucun nouveau lot ni audit", async () => {
    const b = bench();
    const s = await specScene(b);
    const api = batchApi(b.app, s.world.actors.dev);
    const body = {
      idempotencyKey: "invalide",
      branch: BRANCH,
      operations: [createOp("Mauvais", { tables: ["T-nulle-part"] })],
    };

    const first = await api.submit(s.projectId, body);
    b.harness.calls = [];
    const second = await api.submit(s.projectId, body);

    expect(first.status).toBe(422);
    expect(second.status).toBe(422);
    expect(second.body.code).toBe("SPEC_INVALID");
    expect(second.body.data).toEqual(first.body.data);
    expect(b.harness.callsOf("writeCommit")).toEqual([]);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(1);
    expect(await auditCount(b.database, s.world.organizationId, ACTION)).toBe(1);
  });
});

describe("lot terminé en échec : il ne se rejoue pas (suite 2)", () => {
  it("stale_base rejoué : même conflit, même batchId ; pour retenter il faut une nouvelle clé", async () => {
    const b = bench();
    const s = await specScene(b);
    const api = batchApi(b.app, s.world.actors.dev);
    const stale = await headOf(b, s);
    await api.submit(s.projectId, {
      idempotencyKey: "avance",
      branch: BRANCH,
      operations: [createOp("Fait avancer la tête")],
    });
    const body = {
      idempotencyKey: "perime",
      branch: BRANCH,
      baseSha: stale,
      operations: [createOp("Trop tard")],
    };

    const first = await api.submit(s.projectId, body);
    const second = await api.submit(s.projectId, body);
    const retry = await api.submit(s.projectId, {
      ...body,
      idempotencyKey: "perime-2",
      baseSha: await headOf(b, s),
    });

    expect(first.status).toBe(409);
    expect(second.status).toBe(409);
    expect(second.body.data).toEqual(first.body.data);
    expect(second.body.data.reason).toBe("stale_base");
    expect(retry.status, JSON.stringify(retry.body)).toBe(200);
  });
});
