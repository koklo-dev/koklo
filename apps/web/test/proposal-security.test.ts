import { describe, expect, it } from "vitest";
import { modeTextsOf, refOf, subtitleOf } from "../src/lib/proposal-labels.ts";
import { operationsOf } from "../src/lib/proposal-operations.ts";
import { asSecurity } from "../src/lib/proposal-security.ts";
import { fake } from "./support/proposals.tsx";

/** TK-117 lot C : propositions de la Sécurité, de la relecture au lot (B806, A7). */
const operationOf = (proposal: Parameters<typeof operationsOf>[0]) => operationsOf(proposal)[0];
const of = (kind: string, content: Record<string, unknown>, position = 0) =>
  fake(position + 1, { kind: kind as never, title: "T", content, position });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("propositions de la Sécurité", () => {
  it("menace nouvelle ou parade d'une menace ouverte", () => {
    const content = {
      title: "T",
      surfaces: ["F-004"],
      severity: "low",
      measures: ["a"],
      links: [],
    };
    expect(operationOf(of("threat", content))).toEqual({
      kind: "threat.create",
      title: "T",
      surfaces: ["F-004"],
      severity: "low",
      measures: ["a"],
    });
    expect(operationOf(of("threat", { specId: "SEC-T08", measures: ["b"] }))).toEqual({
      kind: "threat.update",
      specId: "SEC-T08",
      measures: ["b"],
    });
  });

  it("donnée : suggestion de conservation seulement, jamais de durée", () => {
    const operation = operationOf(
      of("sensitive", {
        data: "D",
        fields: ["a.b"],
        category: "contact",
        retention: "9 ans",
        retentionSuggestion: "1 an",
        access: [],
      }),
    );
    expect(operation).toEqual({
      kind: "sensitive.create",
      data: "D",
      fields: ["a.b"],
      category: "contact",
      retentionSuggestion: "1 an",
    });
  });

  it("droit, exigence, faits, résumé et section du dossier", () => {
    expect(operationOf(of("right", { ownershipRule: "R" }))).toEqual({
      kind: "right.create",
      ownershipRule: "R",
    });
    const requirement = { chapter: "api", title: "X", level: 2, links: [] };
    expect(operationOf(of("asvs", { requirement }))).toEqual({
      kind: "asvs.create",
      chapter: "api",
      title: "X",
      level: 2,
    });
    expect(
      operationOf(of("asvs", { requirement: { ...requirement, specId: "EX-001", answer: "Oui" } })),
    ).toEqual({
      kind: "asvs.update",
      requirementId: "EX-001",
      chapter: "api",
      title: "X",
      level: 2,
      answer: "Oui",
    });
    expect(operationOf(of("asvs", { facts: [{ label: "a", value: "b" }] }))).toEqual({
      kind: "asvs.update",
      facts: [{ label: "a", value: "b" }],
    });
    expect(operationOf(of("summary", { location: "Paris" }))).toEqual({
      kind: "summary.update",
      location: "Paris",
    });
    const section = asSecurity(of("doc_section", { title: "Incident", markdown: "Texte" }));
    expect(operationOf(section)).toMatchObject({
      kind: "doc.section.create",
      deliverable: "security",
      status: "a_relire",
    });
  });

  it("identifiants, sous-titres et choix de la fenêtre (maquette 15 l.627-666)", () => {
    const menace = of("threat", { surfaces: ["F-009"], severity: "low" });
    expect(subtitleOf(menace)).toBe("Menace · F-009 · gravité faible");
    expect(refOf(of("sensitive", { fields: ["reservations.note"] }))).toBe("reservations.note");
    expect(subtitleOf(of("sensitive", { fields: ["a.b"], category: "contact" }))).toBe(
      "Donnée · Contact",
    );
    expect(refOf(of("right", { permission: "PM-client.exporter" }))).toBe("DR-client-exporter");
    expect(modeTextsOf("security").threats?.title).toBe("Proposer les menaces");
    expect(modeTextsOf("security").classify?.noun).toEqual(["champ", "champs"]);
  });
});
