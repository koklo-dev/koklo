import { describe, expect, it } from "vitest";
import {
  adrIssues,
  adrOperationOf,
  adrValuesOf,
  EMPTY_ADR,
  parseAlternatives,
} from "../src/lib/architecture-decision.ts";

/** TK-113 lot B, cas 3 : valeurs du formulaire Décision (maquette 13 l.956-958) <-> opérations `adr.*`. */
const DETAIL = {
  specId: "ADR-006",
  title: "Fournisseur SMS derrière une interface",
  status: "proposee" as const,
  date: "2026-10-12",
  deciders: ["Moussa"],
  context: "Le fournisseur n'est pas choisi.",
  decision: "Le worker appelle une interface d'envoi.",
  consequences: {
    positive: ["Changement sans toucher au métier."],
    toAccept: ["Une couche de plus."],
  },
  alternatives: [{ name: "Appel direct", reason: "verrouillage" }],
  links: ["C-worker", "C-sms"],
  filePath: "architecture/adr/ADR-006-x.md",
  commitSha: "a".repeat(40),
};

const FILLED = {
  ...EMPTY_ADR,
  title: "Modération des avis",
  context: "Les avis seront publics.",
  decision: "Tout avis est modéré.",
};

describe("valeurs du formulaire Décision", () => {
  it("relit une décision : conséquences en lignes, alternatives « nom · raison », liens en puces", () => {
    expect(adrValuesOf(DETAIL)).toEqual({
      title: "Fournisseur SMS derrière une interface",
      status: "proposee",
      supersededBy: "",
      context: "Le fournisseur n'est pas choisi.",
      decision: "Le worker appelle une interface d'envoi.",
      positives: "Changement sans toucher au métier.",
      accepted: "Une couche de plus.",
      alternatives: "Appel direct · verrouillage",
      links: ["C-worker", "C-sms"],
    });
  });

  it("lit les alternatives d'une ligne par alternative, la raison peut contenir « · »", () => {
    expect(parseAlternatives("A · raison · suite\nB · autre")).toEqual([
      { name: "A", reason: "raison · suite" },
      { name: "B", reason: "autre" },
    ]);
    expect(parseAlternatives("sans séparateur")).toBeNull();
  });
});

describe("contrôle du formulaire Décision", () => {
  it("titre, contexte et décision sont obligatoires", () => {
    expect(adrIssues(EMPTY_ADR).map((issue) => issue.field)).toEqual([
      "title",
      "context",
      "decision",
    ]);
    expect(adrIssues(FILLED)).toEqual([]);
  });

  it("« Remplacée par » est exigée une fois la décision remplacée, et doit être une ADR", () => {
    expect(adrIssues({ ...FILLED, status: "remplacee" }).map((issue) => issue.field)).toEqual([
      "supersededBy",
    ]);
    expect(adrIssues({ ...FILLED, status: "remplacee", supersededBy: "ADR-003" })).toEqual([]);
    expect(adrIssues({ ...FILLED, status: "remplacee", supersededBy: "X" })).toHaveLength(1);
  });

  it("signale une alternative mal écrite, des liens inconnus et des dépassements de longueur", () => {
    expect(adrIssues({ ...FILLED, alternatives: "sans séparateur" }).map((i) => i.field)).toEqual([
      "alternatives",
    ]);
    expect(adrIssues({ ...FILLED, links: ["Z-x"] }).map((i) => i.field)).toEqual(["links"]);
    expect(adrIssues({ ...FILLED, title: "x".repeat(201) }).map((i) => i.field)).toEqual(["title"]);
  });
});

describe("opérations adr.create et adr.update", () => {
  it("crée en omettant les champs vides", () => {
    expect(adrOperationOf({ ...FILLED, status: "acceptee", links: ["C-api"] })).toEqual({
      kind: "adr.create",
      title: "Modération des avis",
      context: "Les avis seront publics.",
      decision: "Tout avis est modéré.",
      status: "acceptee",
      links: ["C-api"],
    });
  });

  it("n'envoie « Remplacée par » que pour une décision remplacée", () => {
    const op = adrOperationOf({ ...FILLED, status: "remplacee", supersededBy: "ADR-003" });
    expect(op).toMatchObject({ status: "remplacee", supersededBy: "ADR-003" });
    expect(
      adrOperationOf({ ...FILLED, status: "acceptee", supersededBy: "ADR-003" }),
    ).not.toHaveProperty("supersededBy");
  });

  it("modifie les seuls champs changés, rien si rien n'a changé", () => {
    const baseline = adrValuesOf(DETAIL);
    expect(adrOperationOf(baseline, { specId: "ADR-006", baseline })).toBeNull();
    expect(
      adrOperationOf({ ...baseline, status: "acceptee" }, { specId: "ADR-006", baseline }),
    ).toEqual({ kind: "adr.update", specId: "ADR-006", status: "acceptee" });
    expect(
      adrOperationOf({ ...baseline, positives: "A\nB" }, { specId: "ADR-006", baseline }),
    ).toEqual({ kind: "adr.update", specId: "ADR-006", positives: ["A", "B"] });
  });
});
