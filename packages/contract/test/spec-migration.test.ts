import { describe, expect, it } from "vitest";
import { generateOpenApi } from "../src/index.ts";
import { errors, input, isValid, output, proc, UUID, UUID2 } from "./support.ts";

/**
 * TK-106 lot B (contrat 3.4.0, additif) : `specMigration.start` et `specMigration.revert`, réservées à l'owner côté
 * serveur. Le suivi du lot passe par `specBatch.get`.
 */
const START = "specMigration.start";
const REVERT = "specMigration.revert";
const BASE = "/projects/{projectId}/spec/migration";

type Operation = { responses: Record<string, unknown> };
type Doc = { info: { version: string }; paths: Record<string, Record<string, Operation>> };

describe("routes", () => {
  it("expose les deux procédures, en POST sous /projects/{projectId}/spec/migration", async () => {
    expect(proc(START)).toBeDefined();
    expect(proc(REVERT)).toBeDefined();
    const doc = (await generateOpenApi()) as unknown as Doc;
    expect(doc.paths[BASE]?.post).toBeDefined();
    expect(doc.paths[`${BASE}/revert`]?.post).toBeDefined();
  });
});

describe("entrées", () => {
  it("start : clé d'idempotence obligatoire, branche facultative", async () => {
    expect(await isValid(input(START), { projectId: UUID, idempotencyKey: "k-1" })).toBe(true);
    expect(
      await isValid(input(START), { projectId: UUID, idempotencyKey: "k-1", branch: "cadrage" }),
    ).toBe(true);
    expect(await isValid(input(START), { projectId: UUID })).toBe(false);
    expect(await isValid(input(START), { projectId: UUID, idempotencyKey: "a b" })).toBe(false);
  });

  it("revert : le lot de la migration est obligatoire et doit être un identifiant", async () => {
    const ok = { projectId: UUID, idempotencyKey: "k-1", migrationBatchId: UUID2 };
    expect(await isValid(input(REVERT), ok)).toBe(true);
    expect(await isValid(input(REVERT), { ...ok, migrationBatchId: "x" })).toBe(false);
    expect(await isValid(input(REVERT), { projectId: UUID, idempotencyKey: "k-1" })).toBe(false);
  });
});

describe("sorties et erreurs", () => {
  it("rendent l'identifiant du lot", async () => {
    for (const name of [START, REVERT]) {
      expect(await isValid(output(name), { batchId: UUID }), name).toBe(true);
      expect(await isValid(output(name), { batchId: "x" }), name).toBe(false);
    }
  });

  it("mêmes erreurs que idea.publish, plus la validation de l'entrée", () => {
    for (const name of [START, REVERT]) {
      const map = errors(name);
      expect(map.FORBIDDEN, name).toBeDefined();
      expect(map.NOT_FOUND, name).toBeDefined();
      expect(map.PROVIDER_UNAVAILABLE, name).toBeDefined();
      expect(map.SPEC_BATCH_CONFLICT, name).toBeDefined();
      expect(map.VALIDATION, name).toBeDefined();
    }
  });

  it("le genre d'opération d'un lot de migration est lisible par specBatch.get", async () => {
    const batch = {
      id: UUID,
      branch: "cadrage",
      status: "committed",
      idempotencyKey: "k",
      baseSha: null,
      commitSha: "a".repeat(40),
      errorCode: null,
      report: null,
      results: [{ position: 0, kind: "spec.migrate", specId: null }],
      enqueuedAt: "2026-11-13T10:00:00.000Z",
      committedAt: "2026-11-13T10:00:01.000Z",
    };
    expect(await isValid(output("specBatch.get"), batch)).toBe(true);
    const revert = {
      ...batch,
      results: [{ position: 0, kind: "spec.migrate.revert", specId: null }],
    };
    expect(await isValid(output("specBatch.get"), revert)).toBe(true);
  });
});
