import { describe, expect, it } from "vitest";
import {
  type ArchitectureCoverageInput,
  architectureCoverage,
  closesSyncCycle,
  synchronousGraph,
} from "../src/index.ts";

/**
 * TK-114b (B616) : couverture de l'architecture, partagée par les avertissements et par la passe de couverture du worker.
 * Fonctionnalités non servies, parcours sans flux technique, tables sans propriétaire, et les compteurs couverts / total.
 */
const ids = (...values: string[]) => values.map((id) => ({ value: { id } }));
const component = (id: string, possede: string[], sert: string[]) => ({
  value: { id, possede, sert },
});

const INPUT: ArchitectureCoverageInput = {
  features: ids("F-001", "F-002", "F-003"),
  flows: ids("P-a", "P-b"),
  tables: ids("T-salle", "T-user", "T-log"),
  components: [
    component("C-api", ["T-user"], ["F-002"]),
    component("C-db", ["T-salle", "T-user"], []),
  ],
  archFlows: ids("P-b"),
};

describe("architectureCoverage", () => {
  it("trous dans l'ordre de l'entrée et compteurs couverts / total", () => {
    expect(architectureCoverage(INPUT)).toEqual({
      unservedFeatures: ["F-001", "F-003"],
      missingFlows: ["P-a"],
      unownedTables: ["T-log"],
      isolatedComponents: ["C-api", "C-db"],
      counts: {
        features: { covered: 1, total: 3 },
        flows: { covered: 1, total: 2 },
        tables: { covered: 2, total: 3 },
        links: { covered: 0, total: 2 },
      },
    });
  });

  it("architecture vide : tout est un trou ; rien à couvrir : 0/0", () => {
    const empty = { features: [], flows: [], tables: [], components: [], archFlows: [] };
    expect(architectureCoverage(empty).counts).toEqual({
      features: { covered: 0, total: 0 },
      flows: { covered: 0, total: 0 },
      tables: { covered: 0, total: 0 },
      links: { covered: 0, total: 0 },
    });
    const bare = { ...INPUT, components: [], archFlows: [] };
    expect(architectureCoverage(bare).unservedFeatures).toEqual(["F-001", "F-002", "F-003"]);
    expect(architectureCoverage(bare).unownedTables).toEqual(["T-salle", "T-user", "T-log"]);
  });

  it("un composant qui sert une fonctionnalité inconnue ne la compte pas", () => {
    const stray = { ...INPUT, components: [component("C-x", ["T-absente"], ["F-999"])] };
    expect(architectureCoverage(stray).counts.features).toEqual({ covered: 0, total: 3 });
    expect(architectureCoverage(stray).counts.tables).toEqual({ covered: 0, total: 3 });
  });
});

/** TK-114c (B633) : composant isolé = aucun lien vers ou depuis un autre composant connu ; jamais un `ext`. */
describe("architectureCoverage, composants isolés", () => {
  const linked = (
    id: string,
    depend_de: { vers: string; mode?: string }[] = [],
    type = "service",
  ) => ({ value: { id, possede: [], sert: [], type, depend_de } });
  const spec = (components: ReturnType<typeof linked>[]) => ({
    ...INPUT,
    components,
  });

  it("lien sortant ou entrant : relié ; soi-même et cible inconnue : isolé ; ext exclu", () => {
    const coverage = architectureCoverage(
      spec([
        linked("C-web", [{ vers: "C-api" }]),
        linked("C-api"),
        linked("C-seul", [{ vers: "C-seul" }]),
        linked("C-perdu", [{ vers: "C-absent" }]),
        linked("C-mail", [], "ext"),
        linked("C-job", [{ vers: "C-mail", mode: "asynchrone" }]),
      ]),
    );
    expect(coverage.isolatedComponents).toEqual(["C-seul", "C-perdu"]);
    expect(coverage.counts.links).toEqual({ covered: 3, total: 5 });
  });

  it("composant sans depend_de (entrée réduite) : isolé", () => {
    expect(architectureCoverage(INPUT).isolatedComponents).toEqual(["C-api", "C-db"]);
  });
});

describe("closesSyncCycle (B635)", () => {
  const graph = synchronousGraph([
    { id: "C-a", depend_de: [{ vers: "C-b" }] },
    { id: "C-b", depend_de: [{ vers: "C-c" }] },
    { id: "C-c", depend_de: [] },
    { id: "C-d", depend_de: [{ vers: "C-a", mode: "asynchrone" }] },
  ]);

  it("un lien synchrone qui retourne à son origine ferme un cycle", () => {
    expect(closesSyncCycle(graph, "C-c", "C-a")).toBe(true);
    expect(closesSyncCycle(graph, "C-a", "C-a")).toBe(true);
  });

  it("aucun chemin retour : pas de cycle ; une arête asynchrone n'en est pas une", () => {
    expect(closesSyncCycle(graph, "C-a", "C-c")).toBe(false);
    expect(closesSyncCycle(graph, "C-a", "C-d")).toBe(false);
    expect(closesSyncCycle(graph, "C-x", "C-y")).toBe(false);
  });
});
