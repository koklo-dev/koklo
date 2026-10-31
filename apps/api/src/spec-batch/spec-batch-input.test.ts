import type { SpecBatchSubmitInput } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import { prepareBatch } from "./spec-batch-input.ts";

const base = (over: Partial<SpecBatchSubmitInput> = {}): SpecBatchSubmitInput => ({
  projectId: "00000000-0000-4000-8000-000000000000",
  idempotencyKey: "k",
  operations: [{ kind: "feature.create", title: "T", priority: "must" }],
  ...over,
});
const fieldOf = (input: SpecBatchSubmitInput) => {
  try {
    prepareBatch(input, "main");
  } catch (error) {
    return (error as { data?: { field?: string } }).data?.field;
  }
  return undefined;
};

describe("prepareBatch", () => {
  it("branche omise : cadrage ; création sans identifiant, payload sans kind", () => {
    const prepared = prepareBatch(base(), "main");
    expect(prepared.branch).toBe("cadrage");
    expect(prepared.operations).toEqual([
      { kind: "feature.create", specId: null, payload: { title: "T", priority: "must" } },
    ]);
    expect(prepared).toMatchObject({ baseSha: null, message: null });
  });

  it("update et delete portent leur specId hors du payload", () => {
    const prepared = prepareBatch(
      base({
        operations: [
          { kind: "feature.update", specId: "F-001", title: "x" },
          { kind: "feature.delete", specId: "F-002" },
        ],
      }),
      "main",
    );
    expect(prepared.operations.map((o) => [o.specId, o.payload])).toEqual([
      ["F-001", { title: "x" }],
      ["F-002", {}],
    ]);
  });

  it("refuse la branche par défaut, un nom invalide, un message multi-lignes, un specId en double", () => {
    expect(fieldOf(base({ branch: "main" }))).toBe("branch");
    expect(fieldOf(base({ branch: "../x" }))).toBe("branch");
    expect(fieldOf(base({ message: "a\nb" }))).toBe("message");
    const twice = [
      { kind: "feature.delete", specId: "F-001" },
      { kind: "feature.delete", specId: "F-001" },
    ] as const;
    expect(fieldOf(base({ operations: [...twice] }))).toBe("operations");
    expect(fieldOf(base({ branch: "travail", message: "ok" }))).toBeUndefined();
  });
});
