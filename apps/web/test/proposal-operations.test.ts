import { describe, expect, it } from "vitest";
import { isSavable, operationOf, planBatches } from "../src/lib/proposal-operations.ts";
import { fake, many } from "./support/proposals.tsx";

/** TK-99b : acceptées -> opérations, lots de 200 au plus, clés d'idempotence stables (fiche §3 critère 10). */
describe("operationOf", () => {
  it("feature -> feature.create avec titre rogné, priorité, description et critères", () => {
    const op = operationOf(fake(1, { content: { ...fake(1).content, title: "  Titre  " } }));
    expect(op).toMatchObject({ kind: "feature.create", title: "Titre", priority: "must" });
  });

  it("criteria -> feature.update de la fonctionnalité visée", () => {
    const op = operationOf(
      fake(1, { kind: "criteria", content: { specId: "F-004", criteria: [] } }),
    );
    expect(op).toMatchObject({ kind: "feature.update", specId: "F-004" });
  });

  it("isSavable : acceptée et pas encore appliquée seulement", () => {
    expect(isSavable(fake(1, { status: "accepted" }))).toBe(true);
    expect(isSavable(fake(1))).toBe(false);
    expect(isSavable(fake(1, { status: "accepted", appliedBatchId: "b" }))).toBe(false);
  });
});

describe("planBatches", () => {
  const accepted = (n: number, zones: number) => many(n, zones, () => ({ status: "accepted" }));

  it("200 ou moins : un seul lot, une opération par proposition, proposalIds alignés", () => {
    const plans = planBatches("L", accepted(200, 8));
    expect(plans).toHaveLength(1);
    expect(plans[0]?.operations).toHaveLength(200);
    expect(plans[0]?.proposalIds).toHaveLength(200);
  });

  it("au-delà de 200 : un lot par groupe, 200 au plus chacun, toutes les propositions couvertes", () => {
    const plans = planBatches("L", accepted(450, 3));
    expect(plans).toHaveLength(3);
    expect(plans.every((p) => p.operations.length <= 200)).toBe(true);
    expect(plans.flatMap((p) => p.proposalIds)).toHaveLength(450);
    expect(new Set(plans.map((p) => p.key)).size).toBe(3);
  });

  it("clé stable pour le même lot, différente quand le contenu change ; forme acceptée par le contrat", () => {
    const first = planBatches("L", accepted(5, 1))[0]?.key;
    expect(planBatches("L", accepted(5, 1))[0]?.key).toBe(first);
    expect(planBatches("L", accepted(6, 1))[0]?.key).not.toBe(first);
    expect(first).toMatch(/^proposal-L-[A-Za-z0-9-]+-1-[a-z0-9]+$/);
    expect(first?.length).toBeLessThanOrEqual(128);
  });
});
