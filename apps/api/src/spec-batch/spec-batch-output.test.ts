import { describe, expect, it } from "vitest";
import type { BatchRecord } from "./spec-batch.repository.ts";
import { allSkipped, failureOf, isOpen, outputOf, skippedOf } from "./spec-batch-output.ts";

const record = (over: Partial<BatchRecord> = {}): BatchRecord => ({
  id: "11111111-1111-4111-8111-111111111111",
  repoId: "r",
  branch: "cadrage",
  status: "failed",
  idempotencyKey: "k",
  baseSha: null,
  commitSha: null,
  errorCode: null,
  report: null,
  message: null,
  enqueuedAt: new Date("2026-10-31T10:00:00.000Z"),
  committedAt: null,
  operations: [{ position: 1, kind: "feature.create", specId: "F-001", payload: {} }],
  ...over,
});
const codeOf = (errorCode: string | null) =>
  (failureOf(record({ errorCode })) as { code?: string }).code;

describe("outputOf", () => {
  it("positions en base 0, dates ISO, aucun champ interne", () => {
    const output = outputOf(record({ status: "queued" }));
    expect(output.results).toEqual([{ position: 0, kind: "feature.create", specId: "F-001" }]);
    expect(output.enqueuedAt).toBe("2026-10-31T10:00:00.000Z");
    expect(output).not.toHaveProperty("message");
    expect(output).not.toHaveProperty("repoId");
  });

  it("isOpen : queued et committing seulement", () => {
    expect(["queued", "committing"].every((s) => isOpen(s as BatchRecord["status"]))).toBe(true);
    expect(
      ["committed", "failed", "conflict"].some((s) => isOpen(s as BatchRecord["status"])),
    ).toBe(false);
  });
});

describe("failureOf", () => {
  it.each([
    ["SPEC_INVALID", "SPEC_INVALID"],
    ["FORBIDDEN", "FORBIDDEN"],
    ["PROVIDER_UNAVAILABLE", "PROVIDER_UNAVAILABLE"],
    ["PROVIDER_AUTH_EXPIRED", "PROVIDER_AUTH_EXPIRED"],
    ["PROVIDER_RATE_LIMITED", "PROVIDER_RATE_LIMITED"],
    ["stale_base", "SPEC_BATCH_CONFLICT"],
    ["write_conflict", "SPEC_BATCH_CONFLICT"],
  ])("%s devient l'erreur typée %s", (errorCode, expected) => {
    expect(codeOf(errorCode)).toBe(expected);
  });

  it("INTERNAL, code inconnu ou absent : erreur interne (pas d'erreur typée)", () => {
    for (const errorCode of ["INTERNAL", "autre", null]) {
      expect(codeOf(errorCode)).toBeUndefined();
    }
  });

  it("le conflit porte la raison et le lot", () => {
    const error = failureOf(record({ errorCode: "stale_base" })) as { data: unknown };
    expect(error.data).toEqual({ reason: "stale_base", batchId: record().id });
  });
});

describe("allSkipped (TK-114e, B672)", () => {
  it("tout écarté : SPEC_BATCH_CONFLICT write_conflict, skipped, aucun lot", () => {
    const skipped = [
      {
        position: 0,
        kind: "doc.section.create",
        specId: "DOC-taches",
        reason: "exists" as const,
        proposalId: "22222222-2222-4222-8222-222222222222",
        outcome: "already_present" as const,
      },
    ];
    const error = allSkipped(skipped);
    expect(error.code).toBe("SPEC_BATCH_CONFLICT");
    expect(error.data).toEqual({ reason: "write_conflict", skipped });
  });

  it("TK-114g (B700) : skippedOf rend l'issue de chaque écartée (already_present, to_review)", () => {
    const base = {
      position: 0,
      kind: "doc.section.create",
      specId: "DOC-taches",
      proposalId: "22222222-2222-4222-8222-222222222222",
    };
    const skipped = [
      { ...base, reason: "exists" as const, outcome: "already_present" as const },
      { ...base, position: 1, reason: "missing" as const, outcome: "to_review" as const },
    ];
    expect(skippedOf(skipped).map(({ outcome }) => outcome)).toEqual([
      "already_present",
      "to_review",
    ]);
  });
});
