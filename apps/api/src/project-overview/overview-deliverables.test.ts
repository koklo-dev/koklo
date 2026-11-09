import { describe, expect, it } from "vitest";
import type { ReviewVerdict } from "../client-space/validation.ts";
import { deliverableCards, functionalStateOf } from "./overview-deliverables.ts";

const PROJECT = "01900000-0000-7000-8000-000000000001";
const verdict = (status: ReviewVerdict["status"], sha: string, n = 1): ReviewVerdict => ({
  id: `id-${n}`,
  status,
  sha,
  createdAt: new Date(2026, 10, n),
});
const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);

describe("functionalStateOf : statuts du Fonctionnel (B273)", () => {
  it("todo : aucune fonctionnalité", () => {
    expect(functionalStateOf([], HEAD)).toMatchObject({ status: "todo", total: 0, done: 0 });
    expect(functionalStateOf([undefined], null)).toMatchObject({ status: "todo", total: 0 });
  });

  it("pending : des fonctionnalités sans verdict sur la version courante", () => {
    const state = functionalStateOf([undefined, verdict("approved", HEAD)], HEAD);
    expect(state).toMatchObject({ status: "pending", total: 2, done: 1, pending: 1, revise: 0 });
  });

  it("validated : toutes approuvées sur la version courante", () => {
    const state = functionalStateOf(
      [verdict("approved", HEAD), verdict("approved", HEAD, 2)],
      HEAD,
    );
    expect(state).toMatchObject({ status: "validated", done: 2, pending: 0 });
  });

  it("revise prime sur pending et sur validated", () => {
    const state = functionalStateOf(
      [verdict("changes_requested", HEAD), undefined, verdict("approved", HEAD)],
      HEAD,
    );
    expect(state).toMatchObject({ status: "revise", revise: 1, pending: 1, done: 1 });
  });

  it("une approbation sur un ancien SHA est périmée : pending", () => {
    const state = functionalStateOf([verdict("approved", OLD)], HEAD);
    expect(state).toMatchObject({ status: "pending", done: 0, pending: 1 });
  });

  it("le dernier verdict compte (changements demandés puis approbation)", () => {
    const latest = verdict("approved", HEAD, 2);
    expect(functionalStateOf([latest], HEAD).status).toBe("validated");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même comportement, un test par cas
describe("deliverableCards : la grille des sept livrables (21 §0)", () => {
  const state = functionalStateOf([undefined, verdict("approved", HEAD)], HEAD);
  const cards = (hasClient: boolean) => deliverableCards(PROJECT, state, hasClient);

  it("sept cartes dans l'ordre de rédaction", () => {
    expect(cards(true).map((card) => card.key)).toEqual([
      "functional",
      "data",
      "architecture",
      "technical",
      "security",
      "design",
      "quality",
    ]);
  });

  it("le Fonctionnel est le seul disponible, avec lien, statut et compte", () => {
    const [functional, ...others] = cards(true);
    expect(functional).toMatchObject({
      key: "functional",
      status: "pending",
      content: "2 fonctionnalités",
      done: 1,
      total: 2,
      progressLabel: "1 fonctionnalité validée sur 2",
      available: true,
      href: `/projects/${PROJECT}/spec/functional`,
    });
    for (const card of others) {
      expect(card).toMatchObject({
        status: "todo",
        content: "Bientôt disponible",
        available: false,
        progressLabel: "À faire",
      });
      expect(card).not.toHaveProperty("href");
      expect(card).not.toHaveProperty("done");
      expect(card).not.toHaveProperty("total");
    }
  });

  it("valideur avec un client : Fonctionnel et Design par le client, les autres par l'équipe", () => {
    const byKey = Object.fromEntries(cards(true).map((card) => [card.key, card]));
    expect(byKey.functional).toMatchObject({
      validator: "client",
      validatorLabel: "Validation client · obligatoire",
    });
    expect(byKey.design).toMatchObject({
      validator: "client",
      validatorLabel: "Validation client · obligatoire",
    });
    expect(byKey.data).toMatchObject({
      validator: "team",
      validatorLabel: "Validation de l'équipe · le client lit et commente",
    });
  });

  it("valideur sans client : l'équipe valide tout", () => {
    const byKey = Object.fromEntries(cards(false).map((card) => [card.key, card]));
    expect(byKey.functional).toMatchObject({
      validator: "team",
      validatorLabel: "Validation par l'équipe",
    });
    expect(byKey.design?.validatorLabel).toBe("Validation par l'équipe");
    expect(byKey.quality?.validatorLabel).toBe("Validation de l'équipe");
  });

  it("sans fonctionnalité : « Aucune fonctionnalité » et pas de compte", () => {
    const empty = deliverableCards(PROJECT, functionalStateOf([], HEAD), true)[0];
    expect(empty).toMatchObject({
      status: "todo",
      content: "Aucune fonctionnalité",
      progressLabel: "Aucune fonctionnalité à valider",
    });
  });
});
