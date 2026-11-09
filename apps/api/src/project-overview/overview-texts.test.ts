import { describe, expect, it } from "vitest";
import { formatDay, initialsOf, type PhaseStepFacts, phaseStepsOf } from "./overview-texts.ts";

const facts = (over: Partial<PhaseStepFacts> = {}): PhaseStepFacts => ({
  phase: "idea",
  stablePages: 5,
  totalPages: 10,
  ideaUnused: false,
  ideaVersion: null,
  validatedDeliverables: 0,
  baselineAt: null,
  sprintKey: null,
  ...over,
});
const steps = (over?: Partial<PhaseStepFacts>) => phaseStepsOf(facts(over));
const subtitles = (over?: Partial<PhaseStepFacts>) => steps(over).map((step) => step.subtitle);
const statuses = (over?: Partial<PhaseStepFacts>) => steps(over).map((step) => step.status);

describe("phaseStepsOf : le fil de phase (03 §4, B260, B272)", () => {
  it("quatre étapes, dont Baseline 0 à venir jusqu'aux Itérations", () => {
    expect(steps().map((step) => step.key)).toEqual(["idea", "framing", "baseline", "iterations"]);
    expect(statuses()).toEqual(["current", "todo", "todo", "todo"]);
    expect(statuses({ phase: "framing" })).toEqual(["done", "current", "todo", "todo"]);
    expect(statuses({ phase: "iterations" })).toEqual(["done", "done", "done", "current"]);
  });

  it("Idée en cours : pages stables sur le total", () => {
    expect(subtitles()[0]).toBe("Dossier en cours, 5 pages stables sur 10");
    expect(subtitles({ stablePages: 1, totalPages: 10 })[0]).toBe(
      "Dossier en cours, 1 page stable sur 10",
    );
  });

  it("Idée terminée : version figée, sinon « Dossier stable », sinon « Non utilisée »", () => {
    const frozenAt = new Date("2026-11-05T10:00:00Z");
    expect(subtitles({ phase: "framing", ideaVersion: { tag: "idea-v1", frozenAt } })[0]).toBe(
      "Version idea-v1 figée le 5 novembre 2026",
    );
    expect(subtitles({ phase: "framing" })[0]).toBe("Dossier stable");
    expect(subtitles({ phase: "framing", ideaUnused: true })[0]).toBe("Non utilisée");
  });

  it("Cadrage : à venir, en cours (livrables validés sur 7), terminé", () => {
    expect(subtitles()[1]).toBe("Après le dossier d'idée");
    expect(subtitles({ phase: "framing", validatedDeliverables: 1 })[1]).toBe(
      "1 livrable validé sur 7",
    );
    expect(subtitles({ phase: "framing" })[1]).toBe("0 livrable validé sur 7");
    expect(subtitles({ phase: "iterations" })[1]).toBe("7 livrables validés");
  });

  it("Baseline 0 : à venir, puis posée le <date>", () => {
    expect(subtitles()[2]).toBe("Posée à la validation du client");
    const baselineAt = new Date("2026-11-12T09:00:00Z");
    expect(subtitles({ phase: "iterations", baselineAt })[2]).toBe("Posée le 12 novembre 2026");
    expect(subtitles({ phase: "iterations" })[2]).toBe("Posée");
  });

  it("Itérations : sprint en cours ou libellé par défaut", () => {
    expect(subtitles()[3]).toBe("Sprints et demandes de changement");
    expect(subtitles({ phase: "iterations", sprintKey: "SP-7" })[3]).toBe("Sprint SP-7 en cours");
    expect(subtitles({ phase: "iterations" })[3]).toBe("Sprints et demandes de changement");
  });
});

describe("formatDay et initialsOf", () => {
  it("date française au fuseau de Paris, jour compris", () => {
    expect(formatDay(new Date("2026-11-04T23:30:00Z"))).toBe("5 novembre 2026");
  });

  it("initiales : deux lettres au plus, sans accent perdu, « ? » sans nom", () => {
    expect(initialsOf("Marie Lefèvre")).toBe("ML");
    expect(initialsOf("Awa")).toBe("A");
    expect(initialsOf("jean-pierre de la Fontaine")).toBe("JD");
    expect(initialsOf("  ")).toBe("?");
  });
});
