import { randomUUID } from "node:crypto";
import type { Role } from "@koklo/contract";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditCount,
  BRANCH,
  batch,
  batchApi,
  batchRows,
  commitsOf,
  createOp,
  createSpecBatchApp,
  deleteOp,
  headOf,
  installSpecBench,
  jobCount,
  specScene,
  submitOk,
  updateOp,
} from "./helpers/spec-batch.ts";
import { createWorld } from "./helpers/tickets.ts";

/** TK-44b §7 : matrice de rôles, appartenance (NOT_FOUND avant tout accès), PROVIDER_UNAVAILABLE. */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });

const ALLOWED: Role[] = ["owner", "admin", "dev"];
const DENIED: Role[] = ["client", "business"];

describe("specBatch.submit : rôles", () => {
  it.each(ALLOWED)("%s peut soumettre un lot", async (role) => {
    const b = bench();
    const s = await specScene(b);

    const body = await submitOk(
      b,
      s,
      [createOp(`Par ${role}`)],
      {},
      role as "owner" | "admin" | "dev",
    );

    expect(body.status).toBe("committed");
    const [row] = await batchRows(b.database, s.projectId);
    expect(row?.author_role).toBe(role);
  });

  it.each(DENIED)(
    "%s reçoit FORBIDDEN : aucun appel fournisseur, aucun lot, aucun audit",
    async (role) => {
      const b = bench();
      const s = await specScene(b);

      const res = await batchApi(b.app, s.world.actors[role]).submit(
        s.projectId,
        batch([createOp("Interdit")], { branch: BRANCH }),
      );

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(b.harness.calls).toEqual([]);
      expect(await batchRows(b.database, s.projectId)).toEqual([]);
      expect(await auditCount(b.database, s.world.organizationId, "spec.batch.submit")).toBe(0);
    },
  );
});

const submitAs = async (operations: unknown[]) => {
  const b = bench();
  const s = await specScene(b);
  const head = await headOf(b, s);
  const res = await batchApi(b.app, s.world.actors.designer).submit(
    s.projectId,
    batch(operations, { branch: BRANCH }),
  );
  return { b, s, head, res };
};

describe("specBatch.submit : designer limité aux features liées à un écran", () => {
  it("modifier une feature dont ecrans est non vide avant et après : accepté", async () => {
    const { res } = await submitAs([updateOp("F-100", { title: "Accueil retouché" })]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe("committed");
  });

  it("créer une feature qui porte un écran dans l'opération : accepté", async () => {
    const { res } = await submitAs([createOp("Écran neuf", { screens: ["S-accueil"] })]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it.each([
    ["créer une feature sans écran", [createOp("Sans écran")]],
    ["modifier une feature sans écran", [updateOp("F-101", { title: "Contact retouché" })]],
    ["retirer les écrans d'une feature (vide après)", [updateOp("F-100", { screens: [] })]],
    [
      "ajouter un écran à une feature qui n'en avait pas (vide avant)",
      [updateOp("F-101", { screens: ["S-accueil"] })],
    ],
    [
      "un lot mêlant une opération permise et une opération interdite",
      [updateOp("F-100", { title: "Permis" }), updateOp("F-101", { title: "Interdit" })],
    ],
  ])("%s : FORBIDDEN, lot failed, rien n'est commité", async (_name, operations) => {
    const { b, s, head, res } = await submitAs(operations);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(await headOf(b, s)).toBe(head);
    expect(b.harness.callsOf("writeCommit")).toEqual([]);
    const [row] = await batchRows(b.database, s.projectId);
    expect(row).toMatchObject({
      status: "failed",
      error_code: "FORBIDDEN",
      author_role: "designer",
    });
  });

  it("owner, admin et dev ne sont pas limités par les écrans", async () => {
    const b = bench();
    const s = await specScene(b);
    for (const role of ["owner", "admin", "dev"] as const) {
      const body = await submitOk(b, s, [updateOp("F-101", { title: `Par ${role}` })], {}, role);
      expect(body.status).toBe("committed");
    }
    expect((await commitsOf(b, s)).length).toBeGreaterThanOrEqual(3);
  });
});

describe("specBatch.get : rôles et appartenance", () => {
  it.each([...ALLOWED, "designer"] as Role[])("%s lit un lot du projet", async (role) => {
    const b = bench();
    const s = await specScene(b);
    const body = await submitOk(b, s, [createOp("À lire")]);

    const res = await batchApi(b.app, s.world.actors[role]).get(s.projectId, body.id);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ id: body.id, status: "committed", commitSha: body.commitSha });
    expect(res.body).not.toHaveProperty("authorUserId");
    expect(await auditCount(b.database, s.world.organizationId, "spec.batch.get")).toBe(0);
  });

  it.each(DENIED)("%s reçoit FORBIDDEN", async (role) => {
    const b = bench();
    const s = await specScene(b);
    const body = await submitOk(b, s, [createOp("Protégé")]);

    const res = await batchApi(b.app, s.world.actors[role]).get(s.projectId, body.id);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("un batchId d'un autre projet de la même organisation : NOT_FOUND", async () => {
    const b = bench();
    const s = await specScene(b);
    const other = await specScene(b);
    const body = await submitOk(b, other, [createOp("Ailleurs")]);

    const res = await batchApi(b.app, s.world.actors.dev).get(s.projectId, body.id);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

describe("specBatch.get : rôles et appartenance (suite 2)", () => {
  it("un batchId d'une autre organisation, ou inconnu : NOT_FOUND, jamais FORBIDDEN", async () => {
    const b = bench();
    const s = await specScene(b);
    const foreign = await specScene(b);
    const body = await submitOk(b, foreign, [createOp("Autre organisation")]);
    const api = batchApi(b.app, s.world.actors.owner);

    for (const [projectId, batchId] of [
      [s.projectId, body.id],
      [foreign.projectId, body.id],
      [s.projectId, randomUUID()],
    ]) {
      const res = await api.get(projectId ?? "", batchId ?? "");
      expect(res.status, `${projectId}/${batchId}`).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
  });
});

describe("appartenance au projet (anti-IDOR), avant tout accès", () => {
  it("un projet d'une autre organisation ou inconnu : NOT_FOUND, aucun appel fournisseur, aucun lot", async () => {
    const b = bench();
    const s = await specScene(b);
    const foreign = await specScene(b);
    const api = batchApi(b.app, s.world.actors.owner);

    for (const projectId of [foreign.projectId, randomUUID()]) {
      const res = await api.submit(projectId, batch([createOp("Intrus")], { branch: BRANCH }));
      expect(res.status, projectId).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    expect(b.harness.calls).toEqual([]);
    expect(await batchRows(b.database, foreign.projectId)).toEqual([]);
    expect(await auditCount(b.database, s.world.organizationId, "spec.batch.submit")).toBe(0);
  });

  it("un projet sans dépôt de spec : NOT_FOUND", async () => {
    const b = bench();
    const world = await createWorld(b.database);

    const res = await batchApi(b.app, world.actors.owner).submit(
      world.projectId,
      batch([createOp("Sans dépôt")], { branch: BRANCH }),
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(await batchRows(b.database, world.projectId)).toEqual([]);
  });
});

describe("fournisseur non configuré (GIT_PROVIDER nul)", () => {
  it("submit répond PROVIDER_UNAVAILABLE 503 avant toute écriture : ni lot, ni audit, ni job", async () => {
    const b = bench();
    const s = await specScene(b);
    const app = await createSpecBatchApp(b.database.url, {
      clock: b.clock,
      provider: null,
      waitMs: 500,
    });
    const jobs = await jobCount(b.database);
    try {
      const res = await batchApi(app, s.world.actors.dev).submit(
        s.projectId,
        batch([createOp("Sans App")], { branch: BRANCH }),
      );

      expect(res.status).toBe(503);
      expect(res.body.code).toBe("PROVIDER_UNAVAILABLE");
      expect(await batchRows(b.database, s.projectId)).toEqual([]);
      expect(await auditCount(b.database, s.world.organizationId, "spec.batch.submit")).toBe(0);
      expect(await jobCount(b.database)).toBe(jobs);
    } finally {
      await app.close();
    }
  });

  it("le refus de rôle garde la priorité : un client reçoit FORBIDDEN même sans App", async () => {
    const b = bench();
    const s = await specScene(b);
    const app = await createSpecBatchApp(b.database.url, {
      clock: b.clock,
      provider: null,
      waitMs: 500,
    });
    try {
      const res = await batchApi(app, s.world.actors.client).submit(
        s.projectId,
        batch([deleteOp("F-101")], { branch: BRANCH }),
      );
      expect(res.status).toBe(403);
    } finally {
      await app.close();
    }
  });
});
