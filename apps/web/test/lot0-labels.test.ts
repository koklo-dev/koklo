import { describe, expect, it } from "vitest";
import * as featureLabels from "../src/lib/feature-labels.ts";
import * as ticketLabels from "../src/lib/ticket-labels.ts";

/**
 * TK-87 lot C : correspondances pures qui alimentent `LifecycleStatus` et `PriorityIndicator`.
 * Stade dérivé côté web (H3, questions.md B22) : implementee ou adoptee -> 3 (Implémentée) ; sinon au moins
 * un critère -> 1 (Spécifiée) ; sinon 0 (Idée). Conçue, Testée et Livrée ne sont jamais déduits au lot 0.
 * Priorité (DESIGN.md v2 §5.1, B23) : fonctionnalités must 3 … wont 0 ; tickets critical 3 … low 0.
 * Noms retenus au Red : `lifecycleStage`, `priorityLevel` (feature-labels), `PRIORITY_LEVELS` (ticket-labels).
 */
type Stage = 0 | 1 | 2 | 3 | 4 | 5;
const lifecycleStage = (featureLabels as Record<string, unknown>).lifecycleStage as
  | ((feature: { status: string; criteriaCount: number }) => Stage)
  | undefined;
const priorityLevel = (featureLabels as Record<string, unknown>).priorityLevel as
  | ((priority: string) => 0 | 1 | 2 | 3)
  | undefined;
const PRIORITY_LEVELS = (ticketLabels as Record<string, unknown>).PRIORITY_LEVELS as
  | Record<string, number>
  | undefined;

describe("lifecycleStage (H3, B22)", () => {
  it("est exporté par lib/feature-labels.ts", () => {
    expect(typeof lifecycleStage).toBe("function");
  });

  it.each([
    ["brouillon", 0, 0],
    ["brouillon", 3, 1],
    ["specifiee", 0, 0],
    ["specifiee", 2, 1],
    ["implementee", 0, 3],
    ["implementee", 4, 3],
    ["adoptee", 0, 3],
    ["inconnu", 5, 1],
    ["inconnu", 0, 0],
  ] as const)("statut %s, %i critère(s) -> stade %i", (status, criteriaCount, stage) => {
    expect(lifecycleStage?.({ status, criteriaCount })).toBe(stage);
  });

  it("ne déduit jamais Conçue (2), Testée (4) ni Livrée (5) au lot 0", () => {
    const seen = new Set<number | undefined>();
    for (const status of ["brouillon", "specifiee", "implementee", "adoptee"]) {
      for (const criteriaCount of [0, 1, 10]) seen.add(lifecycleStage?.({ status, criteriaCount }));
    }
    expect([...seen].sort()).toEqual([0, 1, 3]);
  });
});

describe("priorityLevel (fonctionnalités)", () => {
  it.each([
    ["must", 3],
    ["should", 2],
    ["could", 1],
    ["wont", 0],
  ] as const)("%s -> %i barre(s)", (priority, level) => {
    expect(typeof priorityLevel).toBe("function");
    expect(priorityLevel?.(priority)).toBe(level);
  });

  it("une valeur inconnue n'allume aucune barre", () => {
    expect(typeof priorityLevel).toBe("function");
    expect(priorityLevel?.("autre")).toBe(0);
  });
});

describe("PRIORITY_LEVELS (tickets, B23)", () => {
  it.each([
    ["critical", 3],
    ["high", 2],
    ["medium", 1],
    ["low", 0],
  ] as const)("%s -> %i", (priority, level) => {
    expect(PRIORITY_LEVELS, "PRIORITY_LEVELS exporté").toBeDefined();
    expect(PRIORITY_LEVELS?.[priority]).toBe(level);
  });

  it("les libellés « Priorité … » ne changent pas", () => {
    expect(ticketLabels.PRIORITY_LABELS).toEqual({
      low: "Priorité basse",
      medium: "Priorité moyenne",
      high: "Priorité haute",
      critical: "Priorité critique",
    });
  });
});
