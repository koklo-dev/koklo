import { describe, expect, it } from "vitest";
import { type ArchitectureCoverageInput, architectureCoverage } from "../src/index.ts";

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
      counts: {
        features: { covered: 1, total: 3 },
        flows: { covered: 1, total: 2 },
        tables: { covered: 2, total: 3 },
      },
    });
  });

  it("architecture vide : tout est un trou ; rien à couvrir : 0/0", () => {
    const empty = { features: [], flows: [], tables: [], components: [], archFlows: [] };
    expect(architectureCoverage(empty).counts).toEqual({
      features: { covered: 0, total: 0 },
      flows: { covered: 0, total: 0 },
      tables: { covered: 0, total: 0 },
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
