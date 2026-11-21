import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import { commitAtHead } from "./helpers/spec-architecture.ts";
import {
  auditCount,
  BRANCH,
  batchRows,
  fileOf,
  installSpecBench,
  operationRows,
  specScene,
} from "./helpers/spec-batch.ts";
import { entity, readScene, seedIndex } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-112 lot A (cas 3, B542) : la mise en page du schéma d'architecture. `spec.architecture.layout.save` commite
 * `architecture/_layout.yaml` par un lot d'une opération `architecture.layout.save` (owner, admin, dev ; 403 designer, client,
 * business) sans toucher `data/_layout.yaml` ; `spec.architecture.layout.get` lit le dépôt au commit indexé (designer compris).
 */
const read = installBench({ beforeAll, afterAll, beforeEach });
const write = installSpecBench({ beforeAll, afterAll, beforeEach });

const COMPONENT = {
  id: "C-api",
  titre: "API",
  nom: "API",
  type: "service",
  zone: "Coeur",
  responsabilite: "Expose.",
};
const POSITIONS = { "RL-client": { x: 300, y: 40 }, "C-api": { x: 0, y: 8 } };
const SHA = /^[0-9a-f]{40}$/;
const EXPECTED = "positions:\n  C-api:\n    x: 0\n    y: 8\n  RL-client:\n    x: 300\n    y: 40\n";

const layoutPath = (projectId: string) => `/projects/${projectId}/spec/architecture/layout`;
const saveBody = (projectId: string, over: Record<string, unknown> = {}) => ({
  projectId,
  idempotencyKey: `arch-layout-${Math.random().toString(36).slice(2)}`,
  positions: POSITIONS,
  ...over,
});
const saveAs = (
  b: ReturnType<typeof write>,
  s: { projectId: string; world: { actors: Record<string, { cookie: string }> } },
  role: string,
  over: Record<string, unknown> = {},
) =>
  send(
    b.app,
    s.world.actors[role]?.cookie,
    "post",
    layoutPath(s.projectId),
    saveBody(s.projectId, over),
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.architecture.layout.save", () => {
  it.each(["owner", "admin", "dev"] as const)(
    "%s : commite architecture/_layout.yaml trié, sur cadrage, un seul fichier",
    async (role) => {
      const b = write();
      const s = await specScene(b);
      const res = await saveAs(b, s, role);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.commitSha).toMatch(SHA);
      const file = await fileOf(b, s, "architecture/_layout.yaml");
      expect(file.content).toBe(EXPECTED);
      expect(file.ref).toBe(res.body.commitSha);
      await expect(fileOf(b, s, "data/_layout.yaml")).rejects.toThrow();
      await expect(fileOf(b, s, "architecture/schema.mmd")).rejects.toThrow();
    },
  );

  it("enregistre un lot d'une opération architecture.layout.save, sans cible ni baseSha, audité comme un lot de spec", async () => {
    const b = write();
    const s = await specScene(b);
    await saveAs(b, s, "dev");
    const [row] = await batchRows(b.database, s.projectId);
    expect(row).toMatchObject({ branch: BRANCH, status: "committed", base_sha: null });
    const operations = await operationRows(b.database, row?.id ?? "");
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      kind: "architecture.layout.save",
      target_spec_id: null,
    });
    expect(operations[0]?.payload).toEqual({ positions: POSITIONS });
    expect(await auditCount(b.database, s.world.organizationId, "spec.batch.submit")).toBe(1);
  });

  it("même clé et même contenu : rejoué, un seul lot ; même clé, autre contenu : 409", async () => {
    const b = write();
    const s = await specScene(b);
    const first = await saveAs(b, s, "dev", { idempotencyKey: "arch-layout-fixe" });
    const again = await saveAs(b, s, "dev", { idempotencyKey: "arch-layout-fixe" });
    expect(again.status).toBe(200);
    expect(again.body.commitSha).toBe(first.body.commitSha);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(1);
    const other = await saveAs(b, s, "dev", {
      idempotencyKey: "arch-layout-fixe",
      positions: { "C-api": { x: 1, y: 1 } },
    });
    expect(other.status).toBe(409);
    expect(other.body.code).toBe("SPEC_BATCH_CONFLICT");
  });

  it("deux dépôts successifs : le dernier écrit gagne, aucun conflit", async () => {
    const b = write();
    const s = await specScene(b);
    await saveAs(b, s, "dev");
    const res = await saveAs(b, s, "owner", { positions: { "C-api": { x: 9, y: 9 } } });
    expect(res.status).toBe(200);
    expect((await fileOf(b, s, "architecture/_layout.yaml")).content).toBe(
      "positions:\n  C-api:\n    x: 9\n    y: 9\n",
    );
  });

  it.each([
    ["coordonnée négative", { "C-a": { x: -1, y: 0 } }],
    ["coordonnée au-delà de 20000", { "C-a": { x: 0, y: 20001 } }],
    ["identifiant de table", { "T-a": { x: 0, y: 0 } }],
    ["identifiant mal formé", { api: { x: 0, y: 0 } }],
    [
      "501 entrées",
      Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`C-c${i}`, { x: 0, y: 0 }])),
    ],
  ])(
    "positions invalides (%s) : 400 (validation du contrat), aucun lot",
    async (_label, positions) => {
      const b = write();
      const s = await specScene(b);
      const res = await saveAs(b, s, "dev", { positions });
      expect(res.status).toBe(400);
      expect(await batchRows(b.database, s.projectId)).toEqual([]);
    },
  );

  it.each(["designer", "client", "business"] as const)(
    "%s reçoit 403 FORBIDDEN dès le garde de rôle : aucun lot, aucun fichier",
    async (role) => {
      const b = write();
      const s = await specScene(b);
      const res = await saveAs(b, s, role);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(await batchRows(b.database, s.projectId)).toEqual([]);
      await expect(fileOf(b, s, "architecture/_layout.yaml")).rejects.toThrow();
    },
  );

  it("sans session : 401 ; specBatch.submit ne peut pas porter l'opération (400)", async () => {
    const b = write();
    const s = await specScene(b);
    const anonymous = await send(
      b.app,
      undefined,
      "post",
      layoutPath(s.projectId),
      saveBody(s.projectId),
    );
    expect(anonymous.status).toBe(401);
    const submit = await send(
      b.app,
      s.world.actors.dev.cookie,
      "post",
      `/projects/${s.projectId}/spec/batches`,
      {
        projectId: s.projectId,
        idempotencyKey: "k-submit",
        operations: [{ kind: "architecture.layout.save", positions: POSITIONS }],
      },
    );
    expect(submit.status).toBe(400);
    expect(await batchRows(b.database, s.projectId)).toEqual([]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.architecture.layout.get", () => {
  const seeded = async () => {
    const s = await readScene(read());
    const indexed = await seedIndex(read(), s, [], {
      commit: true,
      entities: [entity("component", "C-api", "c", COMPONENT)],
    });
    return { s, ...indexed };
  };

  it("fichier absent du commit : positions vides, commitSha de la tête", async () => {
    const { s, sha } = await seeded();
    const res = await send(read().app, s.world.actors.dev.cookie, "get", layoutPath(s.projectId));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ positions: {}, commitSha: sha });
  });

  it.each(["owner", "admin", "dev", "designer"] as const)(
    "%s lit les positions écrites",
    async (role) => {
      const { s, snapshotId } = await seeded();
      const sha = await commitAtHead(read(), s, snapshotId, [
        {
          path: "architecture/_layout.yaml",
          content: "positions:\n  C-api:\n    x: 12\n    y: 34\n  RL-client:\n    x: 1\n    y: 2\n",
        },
      ]);
      const res = await send(
        read().app,
        s.world.actors[role].cookie,
        "get",
        layoutPath(s.projectId),
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toEqual({
        positions: { "C-api": { x: 12, y: 34 }, "RL-client": { x: 1, y: 2 } },
        commitSha: sha,
      });
    },
  );

  it("fichier illisible ou hors schéma : positions vides, jamais une erreur", async () => {
    const { s, snapshotId } = await seeded();
    await commitAtHead(read(), s, snapshotId, [
      { path: "architecture/_layout.yaml", content: "positions: [\n" },
    ]);
    const res = await send(read().app, s.world.actors.dev.cookie, "get", layoutPath(s.projectId));
    expect(res.status).toBe(200);
    expect(res.body.positions).toEqual({});
  });

  it.each(["client", "business"] as const)("%s : 403, le dépôt n'est pas lu", async (role) => {
    const { s } = await seeded();
    const res = await send(read().app, s.world.actors[role].cookie, "get", layoutPath(s.projectId));
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain("positions");
  });

  it("rien d'indexé : 404", async () => {
    const s = await readScene(read());
    const res = await send(read().app, s.world.actors.dev.cookie, "get", layoutPath(s.projectId));
    expect(res.status).toBe(404);
  });
});
