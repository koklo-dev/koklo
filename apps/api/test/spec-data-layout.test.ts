import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installBench } from "./helpers/repo-scene.ts";
import {
  auditCount,
  BRANCH,
  batchRows,
  fileOf,
  installSpecBench,
  operationRows,
  specScene,
} from "./helpers/spec-batch.ts";
import { entity, readScene, type SpecReadScene, seedIndex } from "./helpers/spec-read.ts";
import { send } from "./helpers/tickets.ts";

/**
 * TK-108 lot B (B417, B418) : le diagramme du modèle. `spec.data.layout.save` commite `data/_layout.yaml` par un lot d'une
 * opération `layout.save` (owner, admin, dev ; 403 designer, client, business) ; `spec.data.layout.get` et
 * `spec.data.tables.source` lisent le dépôt au commit indexé (403 client et business, jamais de YAML ni de Mermaid chez eux).
 */
const read = installBench({ beforeAll, afterAll, beforeEach });
const write = installSpecBench({ beforeAll, afterAll, beforeEach });

const CLIENT = {
  id: "T-client",
  titre: "Client",
  nom: "Client",
  zone: "Clients",
  champs: [
    { nom: "id", type: "uuid", cle: "primaire" },
    { nom: "nom", type: "texte(80)" },
  ],
};
const POSITIONS = { "T-reservation": { x: 300, y: 40 }, "T-client": { x: 0, y: 8 } };
const SHA = /^[0-9a-f]{40}$/;
const BOT = { name: "Koklo", email: "koklo-bot@users.noreply.invalid" } as const;

const layoutPath = (projectId: string, query = "") =>
  `/projects/${projectId}/spec/data/layout${query}`;
const sourcePath = (projectId: string, tableId: string, query = "") =>
  `/projects/${projectId}/spec/data/tables/${tableId}/source${query}`;
const saveBody = (projectId: string, over: Record<string, unknown> = {}) => ({
  projectId,
  idempotencyKey: `layout-${Math.random().toString(36).slice(2)}`,
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

/** Commit `files` sur `cadrage` puis fait pointer l'instantané indexé dessus (le service lit git au SHA indexé). */
async function commitAtHead(
  s: SpecReadScene,
  snapshotId: string,
  files: { path: string; content: string }[],
) {
  const auth = await read().harness.authFor(s.owner);
  const commit = await read().harness.inner.writeCommit({
    auth,
    repo: s.ref,
    branch: "cadrage",
    author: BOT,
    message: "test: fichiers du diagramme",
    files,
  });
  await read().database.query("UPDATE spec_snapshots SET commit_sha = $2 WHERE id = $1", [
    snapshotId,
    commit.sha,
  ]);
  return commit.sha;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.data.layout.save", () => {
  it.each(["owner", "admin", "dev"] as const)(
    "%s : commite data/_layout.yaml trié, sur cadrage, un seul fichier",
    async (role) => {
      const b = write();
      const s = await specScene(b);

      const res = await saveAs(b, s, role);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.commitSha).toMatch(SHA);
      const file = await fileOf(b, s, "data/_layout.yaml");
      expect(file.content).toBe(
        "positions:\n  T-client:\n    x: 0\n    y: 8\n  T-reservation:\n    x: 300\n    y: 40\n",
      );
      expect(file.ref).toBe(res.body.commitSha);
      await expect(fileOf(b, s, "data/model.mmd")).rejects.toThrow();
    },
  );

  it("enregistre un lot d'une opération layout.save, message « Mise en page du diagramme », sans baseSha", async () => {
    const b = write();
    const s = await specScene(b);
    await saveAs(b, s, "dev");
    const [row] = await batchRows(b.database, s.projectId);
    expect(row).toMatchObject({
      branch: BRANCH,
      status: "committed",
      base_sha: null,
      message: "Mise en page du diagramme",
    });
    const operations = await operationRows(b.database, row?.id ?? "");
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ kind: "layout.save", target_spec_id: null });
    expect(operations[0]?.payload).toEqual({ positions: POSITIONS });
  });

  it("audité comme un lot de spec : une entrée spec.batch.submit", async () => {
    const b = write();
    const s = await specScene(b);
    await saveAs(b, s, "dev");
    expect(await auditCount(b.database, s.world.organizationId, "spec.batch.submit")).toBe(1);
  });

  it("même clé et même contenu : rejoué, un seul lot ; même clé, autre contenu : 409", async () => {
    const b = write();
    const s = await specScene(b);
    const first = await saveAs(b, s, "dev", { idempotencyKey: "layout-fixe" });
    const again = await saveAs(b, s, "dev", { idempotencyKey: "layout-fixe" });
    expect(again.status).toBe(200);
    expect(again.body.commitSha).toBe(first.body.commitSha);
    expect(await batchRows(b.database, s.projectId)).toHaveLength(1);
    const other = await saveAs(b, s, "dev", {
      idempotencyKey: "layout-fixe",
      positions: { "T-client": { x: 1, y: 1 } },
    });
    expect(other.status).toBe(409);
    expect(other.body.code).toBe("SPEC_BATCH_CONFLICT");
  });

  it("deux dépôts successifs : le dernier écrit gagne, aucun conflit", async () => {
    const b = write();
    const s = await specScene(b);
    await saveAs(b, s, "dev");
    const res = await saveAs(b, s, "owner", { positions: { "T-client": { x: 9, y: 9 } } });
    expect(res.status).toBe(200);
    expect((await fileOf(b, s, "data/_layout.yaml")).content).toBe(
      "positions:\n  T-client:\n    x: 9\n    y: 9\n",
    );
  });

  it.each([
    ["coordonnée négative", { "T-a": { x: -1, y: 0 } }],
    ["coordonnée au-delà de 20000", { "T-a": { x: 0, y: 20001 } }],
    ["identifiant mal formé", { client: { x: 0, y: 0 } }],
    [
      "501 entrées",
      Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`T-t${i}`, { x: 0, y: 0 }])),
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
      await expect(fileOf(b, s, "data/_layout.yaml")).rejects.toThrow();
    },
  );

  it("sans session : 401", async () => {
    const b = write();
    const s = await specScene(b);
    const res = await send(
      b.app,
      undefined,
      "post",
      layoutPath(s.projectId),
      saveBody(s.projectId),
    );
    expect(res.status).toBe(401);
  });

  it("specBatch.submit ne peut pas porter l'opération layout.save (réservée à la procédure dédiée)", async () => {
    const b = write();
    const s = await specScene(b);
    const res = await send(
      b.app,
      s.world.actors.dev.cookie,
      "post",
      `/projects/${s.projectId}/spec/batches`,
      {
        projectId: s.projectId,
        idempotencyKey: "k-submit",
        operations: [{ kind: "layout.save", positions: POSITIONS }],
      },
    );
    expect(res.status).toBe(400);
    expect(await batchRows(b.database, s.projectId)).toEqual([]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.data.layout.get", () => {
  it("fichier absent du commit : positions vides, commitSha de la tête", async () => {
    const s = await readScene(read());
    const { sha } = await seedIndex(read(), s, [], {
      commit: true,
      entities: [entity("table", "T-client", "c", CLIENT)],
    });
    const res = await send(read().app, s.world.actors.dev.cookie, "get", layoutPath(s.projectId));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ positions: {}, commitSha: sha });
  });

  it.each(["owner", "admin", "dev", "designer"] as const)(
    "%s lit les positions écrites",
    async (role) => {
      const s = await readScene(read());
      const { snapshotId } = await seedIndex(read(), s, [], {
        commit: true,
        entities: [entity("table", "T-client", "c", CLIENT)],
      });
      const sha = await commitAtHead(s, snapshotId, [
        { path: "data/_layout.yaml", content: "positions:\n  T-client:\n    x: 12\n    y: 34\n" },
      ]);
      const res = await send(
        read().app,
        s.world.actors[role].cookie,
        "get",
        layoutPath(s.projectId),
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toEqual({ positions: { "T-client": { x: 12, y: 34 } }, commitSha: sha });
    },
  );

  it("fichier illisible ou hors schéma : positions vides, jamais une erreur", async () => {
    const s = await readScene(read());
    const { snapshotId } = await seedIndex(read(), s, [], { commit: true, entities: [] });
    await commitAtHead(s, snapshotId, [{ path: "data/_layout.yaml", content: "positions: [\n" }]);
    const res = await send(read().app, s.world.actors.dev.cookie, "get", layoutPath(s.projectId));
    expect(res.status).toBe(200);
    expect(res.body.positions).toEqual({});
  });

  it.each(["client", "business"] as const)(
    "%s : 403, le contenu du dépôt n'est pas lu",
    async (role) => {
      const s = await readScene(read());
      await seedIndex(read(), s, [], { commit: true, entities: [] });
      const res = await send(
        read().app,
        s.world.actors[role].cookie,
        "get",
        layoutPath(s.projectId),
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(JSON.stringify(res.body)).not.toContain("positions");
    },
  );

  it("rien d'indexé : 404", async () => {
    const s = await readScene(read());
    const res = await send(read().app, s.world.actors.dev.cookie, "get", layoutPath(s.projectId));
    expect(res.status).toBe(404);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.data.tables.source", () => {
  const seed = async () => {
    const s = await readScene(read());
    const indexed = await seedIndex(read(), s, [], {
      commit: true,
      entities: [entity("table", "T-client", "c", CLIENT)],
    });
    await read().database.query(
      "UPDATE spec_entities SET path = 'data/tables/client.yaml' WHERE snapshot_id = $1 AND spec_id = 'T-client'",
      [indexed.snapshotId],
    );
    return { s, ...indexed };
  };

  it("rend le fichier du dépôt tel qu'écrit (generated: false)", async () => {
    const { s, snapshotId } = await seed();
    const text = "id: T-client\nnom: Client\nchamps:\n  - nom: id\n    type: uuid\n";
    const sha = await commitAtHead(s, snapshotId, [
      { path: "data/tables/client.yaml", content: text },
    ]);
    const res = await send(
      read().app,
      s.world.actors.dev.cookie,
      "get",
      sourcePath(s.projectId, "T-client"),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      path: "data/tables/client.yaml",
      text,
      commitSha: sha,
      generated: false,
    });
  });

  it("fichier absent du commit : YAML généré depuis l'index (generated: true)", async () => {
    const { s, sha } = await seed();
    const res = await send(
      read().app,
      s.world.actors.designer.cookie,
      "get",
      sourcePath(s.projectId, "T-client"),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.generated).toBe(true);
    expect(res.body.commitSha).toBe(sha);
    expect(res.body.path).toBe("data/tables/client.yaml");
    expect(res.body.text).toContain("id: T-client");
    expect(res.body.text).toContain("nom: Client");
  });

  it("table inconnue : 404", async () => {
    const { s } = await seed();
    const res = await send(
      read().app,
      s.world.actors.dev.cookie,
      "get",
      sourcePath(s.projectId, "T-inconnue"),
    );
    expect(res.status).toBe(404);
  });

  it.each(["client", "business"] as const)(
    "%s : 403, ni YAML ni Mermaid dans la réponse",
    async (role) => {
      const { s } = await seed();
      for (const path of [
        sourcePath(s.projectId, "T-client"),
        layoutPath(s.projectId),
        `/projects/${s.projectId}/spec/data/mermaid`,
      ]) {
        const res = await send(read().app, s.world.actors[role].cookie, "get", path);
        expect(res.status, `${role} ${path}`).toBe(403);
        const body = JSON.stringify(res.body);
        expect(body).not.toContain("erDiagram");
        expect(body).not.toContain("id: T-client");
      }
    },
  );
});
