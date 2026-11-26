import { specPathIndex } from "@koklo/schema";
import { describe, expect, it } from "vitest";
import type { PreparedOperation } from "./spec-batch.repository.ts";
import { precheckBatch } from "./spec-batch-precheck.ts";

/**
 * TK-114e (B671, B672, B675) : pré-vérification pure d'un enregistrement de propositions. Une opération en conflit avec la
 * tête (ou en double dans le lot) écarte toutes les opérations de sa proposition ; positions et identifiants rendus sont
 * ceux de l'entrée. Rôle, mise en page, table et jeu d'exemple ne sont jamais vérifiés.
 */
const HEAD = specPathIndex([
  "features/F-100-accueil.md",
  "domain/rules/R-001-plafond.md",
  "design/flows/P-reserver.yaml",
  "architecture/components/api.yaml",
  "architecture/flows/P-reserver.yaml",
  "architecture/adr/ADR-001-postgresql.md",
  "architecture/overview/01-taches-modeles-de-taches-et-cycle-de-vie.md",
  "data/tables/reservation.yaml",
  "data/fixtures/FX-demo.yaml",
]);
const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const P3 = "00000000-0000-4000-8000-000000000003";

const op = (
  kind: string,
  specId: string | null,
  payload: Record<string, unknown> = {},
): PreparedOperation => ({
  kind,
  specId,
  payload,
});
const section = (title: string) => op("doc.section.create", null, { title, markdown: "x" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même fonction, un test par comportement
describe("precheckBatch", () => {
  it("une proposition à deux opérations dont une en conflit : les deux écartées, positions de l'entrée", () => {
    const operations = [
      op("component.create", null, { name: "Cache" }),
      section("Tâches, modèles de tâches et cycle de vie"),
      op("component.update", "C-api", { responsibility: "Sert." }),
      section("Déploiement"),
    ];
    const result = precheckBatch(operations, [P1, P2, P3, P2], HEAD);
    expect(result.kept).toEqual([operations[0], operations[2]]);
    expect(result.keptProposalIds).toEqual([P1, P3]);
    expect(result.alreadyPresentProposalIds).toEqual([P2]);
    expect(result.skipped).toEqual([
      {
        position: 1,
        kind: "doc.section.create",
        specId: "DOC-taches-modeles-de-taches-et-cycle-de-vie",
        reason: "exists",
        proposalId: P2,
        outcome: "already_present",
      },
      {
        position: 3,
        kind: "doc.section.create",
        specId: "DOC-deploiement",
        reason: "exists",
        proposalId: P2,
        outcome: "already_present",
      },
    ]);
  });

  it("modification ou suppression d'un absent : missing ; création en double dans le lot : duplicate", () => {
    const operations = [
      op("archflow.update", "P-payer", { messages: [] }),
      op("component.create", null, { name: "Cache" }),
      op("component.create", null, { name: "Cache" }),
      op("feature.delete", "F-404"),
    ];
    const result = precheckBatch(operations, [P1, P2, P3, P3], HEAD);
    expect(result.kept).toEqual([operations[1]]);
    expect(result.skipped.map(({ position, reason }) => [position, reason])).toEqual([
      [0, "missing"],
      [2, "duplicate"],
      [3, "missing"],
    ]);
    expect(result.skipped[1]?.specId).toBe("C-cache");
  });

  it("chaque genre vérifié : feature, rule, flow, component, archflow, adr, doc", () => {
    const operations = [
      op("feature.update", "F-100", { title: "x" }),
      op("rule.delete", "R-002"),
      op("flow.create", null, { title: "Réserver" }),
      op("archflow.create", null, { flow: "P-reserver" }),
      op("adr.update", "ADR-009", { title: "x" }),
      op("doc.section.update", "DOC-taches-modeles-de-taches-et-cycle-de-vie", { markdown: "y" }),
    ];
    const proposals = [P1, P2, P3, P1, P2, P3].map((_, k) => `${P1.slice(0, -1)}${k}`);
    const result = precheckBatch(operations, proposals, HEAD);
    expect(result.skipped.map(({ position, reason }) => [position, reason])).toEqual([
      [1, "missing"],
      [2, "exists"],
      [3, "exists"],
      [4, "missing"],
    ]);
    expect(result.kept).toEqual([operations[0], operations[5]]);
  });

  it("rôle, mise en page, table et jeu d'exemple jamais écartés ; création numérotée jamais en conflit", () => {
    const operations = [
      op("role.create", null, { name: "Client" }),
      op("architecture.layout.save", null, {}),
      op("table.create", null, { name: "reservation" }),
      op("fixture.create", null, { title: "demo" }),
      op("feature.create", null, { title: "Accueil" }),
      op("adr.create", null, { title: "PostgreSQL" }),
      op("rule.create", null, { title: "Plafond" }),
    ];
    const result = precheckBatch(operations, Array(7).fill(P1), HEAD);
    expect(result.skipped).toEqual([]);
    expect(result.kept).toEqual(operations);
    expect(result.keptProposalIds).toEqual([P1]);
    expect(result.alreadyPresentProposalIds).toEqual([]);
  });

  it("TK-114g (B698) : déjà présente seulement si tous ses conflits propres sont exists, sinon remise à relire", () => {
    const operations = [
      section("Tâches, modèles de tâches et cycle de vie"),
      op("component.create", null, { name: "API" }),
      op("component.update", "C-disparu", { responsibility: "Sert." }),
      op("archflow.update", "P-payer", { messages: [] }),
      op("flow.create", null, { title: "Payer" }),
      op("flow.create", null, { title: "Payer" }),
    ];
    const result = precheckBatch(
      operations,
      [P1, P2, P2, P3, `${P1.slice(0, -1)}4`, `${P1.slice(0, -1)}5`],
      HEAD,
    );
    expect(result.alreadyPresentProposalIds).toEqual([P1]);
    expect(
      result.skipped.map(({ position, reason, outcome }) => [position, reason, outcome]),
    ).toEqual([
      [0, "exists", "already_present"],
      [1, "exists", "to_review"],
      [2, "missing", "to_review"],
      [3, "missing", "to_review"],
      [5, "duplicate", "to_review"],
    ]);
    expect(result.kept).toEqual([operations[4]]);
  });

  it("TK-114g (B698) : une opération écartée par contagion suit le sort de sa proposition", () => {
    const operations = [
      section("Tâches, modèles de tâches et cycle de vie"),
      op("component.create", null, { name: "Cache" }),
    ];
    const result = precheckBatch(operations, [P1, P1], HEAD);
    expect(result.alreadyPresentProposalIds).toEqual([P1]);
    expect(result.skipped.map(({ outcome }) => outcome)).toEqual([
      "already_present",
      "already_present",
    ]);
  });
});
