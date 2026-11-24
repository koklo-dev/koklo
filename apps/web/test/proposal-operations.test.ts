import { describe, expect, it } from "vitest";
import {
  BATCH_BYTES_BUDGET,
  isSavable,
  operationOf,
  planBatches,
} from "../src/lib/proposal-operations.ts";
import { fake, many } from "./support/proposals.tsx";

/** TK-99b : acceptées -> opérations, lots de 200 au plus, clés d'idempotence stables (fiche §3 critère 10). */
describe("operationOf", () => {
  it("feature -> feature.create avec titre rogné, priorité, description et critères", () => {
    const op = operationOf(fake(1, { content: { ...fake(1).content, title: "  Titre  " } }));
    expect(op).toMatchObject({ kind: "feature.create", title: "Titre", priority: "must" });
  });

  it("feature : la zone de la proposition part dans feature.create, absente quand elle est vide (B366)", () => {
    expect(operationOf(fake(1, { zone: "  Paiement " }))).toMatchObject({ zone: "Paiement" });
    expect(operationOf(fake(1, { zone: "" }))).not.toHaveProperty("zone");
    expect(operationOf(fake(1, { zone: "x".repeat(120) }))).toMatchObject({ zone: "x".repeat(80) });
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

  it("isSavable : une acceptée tenue par un lot échoué redevient enregistrable (TK-114e, B673)", () => {
    const held = fake(1, { status: "accepted", appliedBatchId: "b" });
    expect(isSavable(held, new Set(["b"]))).toBe(true);
    expect(isSavable(held, new Set(["autre"]))).toBe(false);
    expect(isSavable(fake(1, { appliedBatchId: "b" }), new Set(["b"]))).toBe(false);
  });
});

const accepted = (n: number, zones: number) => many(n, zones, () => ({ status: "accepted" }));

describe("planBatches", () => {
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

  it("lots coupés aussi par taille : chaque lot sous le budget en octets, ordre et couverture conservés", () => {
    const long = many(30, 1, (i) => ({
      status: "accepted",
      content: { ...fake(i).content, description: "Description détaillée. ".repeat(200) },
    }));
    const one = new TextEncoder().encode(JSON.stringify(operationOf(long[0] as never))).length;
    const budget = one * 7;
    const plans = planBatches("L", long, budget);
    expect(plans.length).toBeGreaterThanOrEqual(5);
    for (const plan of plans) {
      expect(plan.operations.length).toBeLessThanOrEqual(7);
      const bytes = new TextEncoder().encode(JSON.stringify(plan.operations)).length;
      expect(bytes).toBeLessThanOrEqual(budget + plan.operations.length + 2);
    }
    expect(plans.flatMap((p) => p.proposalIds)).toEqual(long.map((p) => p.id));
    expect(new Set(plans.map((p) => p.key)).size).toBe(plans.length);
  });

  it("budget par défaut : les trois quarts des 4 Mio de l'API", () => {
    expect(BATCH_BYTES_BUDGET).toBe(3 * 1024 * 1024);
  });

  it("clé stable pour le même lot, différente quand le contenu change ; forme acceptée par le contrat", () => {
    const first = planBatches("L", accepted(5, 1))[0]?.key;
    expect(planBatches("L", accepted(5, 1))[0]?.key).toBe(first);
    expect(planBatches("L", accepted(6, 1))[0]?.key).not.toBe(first);
    expect(first).toMatch(/^proposal-L-[A-Za-z0-9-]+-1-[a-z0-9]+$/);
    expect(first?.length).toBeLessThanOrEqual(128);
  });
});

describe("planBatches : correspondance et réessai", () => {
  it("operationProposals : la proposition de chaque opération, parallèle aux opérations (B675)", () => {
    const relations = fake(3, {
      status: "accepted",
      kind: "relations",
      content: {
        updates: [
          { specId: "T-client", relations: [] },
          { specId: "T-rdv", relations: [] },
        ],
      },
    });
    const items = [fake(1, { status: "accepted" }), relations, fake(2, { status: "accepted" })];
    const [plan] = planBatches("L", items);
    expect(plan?.operations).toHaveLength(4);
    expect(plan?.operationProposals).toEqual([
      items[0]?.id,
      relations.id,
      relations.id,
      items[2]?.id,
    ]);
  });

  it("réessai : clé du plan suivie de -r<empreinte des lots échoués>, 128 au plus (B673)", () => {
    const items = accepted(5, 1);
    const plain = planBatches("L", items)[0]?.key ?? "";
    const retry = planBatches("L", items, BATCH_BYTES_BUDGET, ["b2", "b1"])[0]?.key ?? "";
    expect(retry).toMatch(new RegExp(`^${plain}-r[a-z0-9]+$`));
    expect(planBatches("L", items, BATCH_BYTES_BUDGET, ["b1", "b2"])[0]?.key).toBe(retry);
    expect(planBatches("L", items, BATCH_BYTES_BUDGET, ["b3"])[0]?.key).not.toBe(retry);
    const long = planBatches("0190aaaa-0000-7000-8000-000000000001", items, BATCH_BYTES_BUDGET, [
      "x",
    ]);
    expect(long[0]?.key.length).toBeLessThanOrEqual(128);
    expect(long[0]?.key).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
  });
});
