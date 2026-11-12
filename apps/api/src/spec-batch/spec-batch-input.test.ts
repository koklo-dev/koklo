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

describe("prepareBatch : règles, rôles et parcours (TK-103)", () => {
  it("les créations portent un specId nul (attribué à l'enfilage), les autres leur identifiant", () => {
    const prepared = prepareBatch(
      base({
        operations: [
          { kind: "rule.create", title: "Délai", type: "contrainte", statement: "x" },
          {
            kind: "role.create",
            name: "Chef",
            description: "d",
            permissions: [{ id: "PM-a.lire" }],
          },
          {
            kind: "flow.create",
            title: "Inscription",
            actor: "Visiteur",
            start: { label: "a" },
            steps: [{ label: "b" }],
          },
          { kind: "rule.update", specId: "R-001", title: "Nouveau" },
          { kind: "role.delete", specId: "RL-chef" },
          { kind: "flow.update", specId: "P-inscription", actor: "Client" },
        ],
      }),
      "main",
    );
    expect(prepared.operations.map((o) => [o.kind, o.specId])).toEqual([
      ["rule.create", null],
      ["role.create", null],
      ["flow.create", null],
      ["rule.update", "R-001"],
      ["role.delete", "RL-chef"],
      ["flow.update", "P-inscription"],
    ]);
    expect(prepared.operations[3]?.payload).toEqual({ title: "Nouveau" });
  });

  it("refuse deux opérations sur la même règle", () => {
    const twice = [
      { kind: "rule.update", specId: "R-001", title: "a" },
      { kind: "rule.delete", specId: "R-001" },
    ] as SpecBatchSubmitInput["operations"];
    expect(fieldOf(base({ operations: twice }))).toBe("operations");
  });
});
