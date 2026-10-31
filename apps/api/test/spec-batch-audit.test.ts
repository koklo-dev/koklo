import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditRowsFull, UUID_RE } from "./helpers/comments.ts";
import {
  auditCount,
  BRANCH,
  batch,
  batchApi,
  batchRows,
  commitsOf,
  createOp,
  headOf,
  installSpecBench,
  jobCount,
  operationRows,
  specScene,
  submitOk,
} from "./helpers/spec-batch.ts";

/**
 * TK-44b §7 : une entrée d'audit par lot créé, dans la MÊME transaction que le lot, les opérations
 * et les F-nnn ; aucune écriture hors de cette transaction ; aucun appel réseau sous transaction.
 */
const bench = installSpecBench({ beforeAll, afterAll, beforeEach });
const ACTION = "spec.batch.submit";

describe("audit de specBatch.submit", () => {
  it("une seule entrée exacte : action, cible = lot, acteur = utilisateur de la session", async () => {
    const b = bench();
    const s = await specScene(b);
    const before = (await auditRowsFull(b.database, s.world.organizationId)).length;

    const body = await submitOk(b, s, [createOp("Auditée")]);

    const created = (await auditRowsFull(b.database, s.world.organizationId)).slice(before);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      action: ACTION,
      target_kind: "spec_batch",
      target_id: body.id,
      ticket_id: null,
      actor_kind: "human",
      actor_id: s.world.actors.dev.userId,
    });
    expect(created[0]?.target_id).toMatch(UUID_RE);
  });

  it("un lot terminé en échec (SPEC_INVALID) a bien son entrée ; une lecture, un refus de rôle ou de validation n'en ont aucune", async () => {
    const b = bench();
    const s = await specScene(b);
    const dev = batchApi(b.app, s.world.actors.dev);

    const invalid = await dev.submit(
      s.projectId,
      batch([createOp("Fautif", { tables: ["T-x"] })], { branch: BRANCH }),
    );
    expect(invalid.status).toBe(422);
    expect(await auditCount(b.database, s.world.organizationId, ACTION)).toBe(1);

    const [row] = await batchRows(b.database, s.projectId);
    await dev.get(s.projectId, row?.id ?? "");
    await batchApi(b.app, s.world.actors.client).submit(
      s.projectId,
      batch([createOp("Refusé")], { branch: BRANCH }),
    );
    await dev.submit(s.projectId, batch([createOp("Refusé")], { branch: "main" }));
    expect(await auditCount(b.database, s.world.organizationId, ACTION)).toBe(1);
  });
});

describe("audit de specBatch.submit (suite 2)", () => {
  it("les transitions du worker n'écrivent rien dans le journal d'audit", async () => {
    const b = bench();
    const s = await specScene(b);
    const before = (await auditRowsFull(b.database, s.world.organizationId)).length;

    await submitOk(b, s, [createOp("Une")]);

    expect((await auditRowsFull(b.database, s.world.organizationId)).length).toBe(before + 1);
  });
});

describe("même transaction que le lot", () => {
  it("l'audit en échec annule le lot, ses opérations, les F-nnn attribués et l'enfilage", async () => {
    const b = bench();
    const s = await specScene(b);
    await b.database.query("INSERT INTO audit_fail (action) VALUES ($1)", [ACTION]);
    const jobs = await jobCount(b.database);
    const head = await headOf(b, s);

    const res = await batchApi(b.app, s.world.actors.dev).submit(
      s.projectId,
      batch([createOp("Annulée")], { branch: BRANCH }),
    );

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL");
    expect(await batchRows(b.database, s.projectId)).toEqual([]);
    expect(
      await b.database.query("SELECT 1 FROM spec_write_operations WHERE organization_id = $1", [
        s.world.organizationId,
      ]),
    ).toEqual([]);
    expect(
      await b.database.query(
        "SELECT 1 FROM project_counters WHERE project_id = $1 AND name = 'feature' AND last_value > 0",
        [s.projectId],
      ),
    ).toEqual([]);
    expect(await jobCount(b.database)).toBe(jobs);
    expect(b.harness.callsOf("writeCommit")).toEqual([]);
    expect(await headOf(b, s)).toBe(head);
  });
});

describe("même transaction que le lot (suite 2)", () => {
  it("l'échec d'insertion d'une opération annule aussi le lot et l'audit (aucune écriture hors transaction)", async () => {
    const b = bench();
    const s = await specScene(b);
    await b.database.query("CREATE TABLE IF NOT EXISTS ops_fail (flag boolean)");
    await b.database.query(`
      CREATE OR REPLACE FUNCTION ops_fail_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM ops_fail) THEN RAISE EXCEPTION 'opération refusée pour le test'; END IF;
        RETURN NEW;
      END $$`);
    await b.database.query("DROP TRIGGER IF EXISTS ops_fail_trigger ON spec_write_operations");
    await b.database.query(
      "CREATE TRIGGER ops_fail_trigger BEFORE INSERT ON spec_write_operations FOR EACH ROW EXECUTE FUNCTION ops_fail_guard()",
    );
    await b.database.query("INSERT INTO ops_fail VALUES (true)");
    const jobs = await jobCount(b.database);
    try {
      const res = await batchApi(b.app, s.world.actors.dev).submit(
        s.projectId,
        batch([createOp("Une"), createOp("Deux")], { branch: BRANCH }),
      );

      expect(res.status).toBe(500);
      expect(await batchRows(b.database, s.projectId)).toEqual([]);
      expect(await auditCount(b.database, s.world.organizationId, ACTION)).toBe(0);
      expect(await jobCount(b.database)).toBe(jobs);
    } finally {
      await b.database.query("DELETE FROM ops_fail");
      await b.database.query("DROP TRIGGER IF EXISTS ops_fail_trigger ON spec_write_operations");
    }
  });
});

describe("aucun appel au fournisseur pendant une transaction SQL", () => {
  it("chaque appel du worker se fait sans transaction applicative ouverte", async () => {
    const b = bench();
    const s = await specScene(b);

    await submitOk(b, s, [createOp("Une"), createOp("Deux")]);

    expect(b.harness.calls.length).toBeGreaterThan(0);
    expect(b.harness.calls.filter((call) => call.openTransactions > 0)).toEqual([]);
    const names = b.harness.names();
    expect(names).toEqual(expect.arrayContaining(["authenticate", "listFiles", "writeCommit"]));
  });

  it("le worker se limite à la lecture de l'état puis à un seul writeCommit pour le lot", async () => {
    const b = bench();
    const s = await specScene(b);
    const commits = (await commitsOf(b, s)).length;

    const body = await submitOk(b, s, [createOp("Une"), createOp("Deux"), createOp("Trois")]);

    expect(b.harness.callsOf("writeCommit")).toHaveLength(1);
    expect((await commitsOf(b, s)).length).toBe(commits + 1);
    expect((await operationRows(b.database, body.id)).map((op) => op.position)).toEqual([1, 2, 3]);
  });
});
