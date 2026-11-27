import { describe, expect, it } from "vitest";
import type { LaunchSources } from "./sources.ts";
import { compareChoicesOf, technicalKindsAt, technicalSteps } from "./technical-steps.ts";

/**
 * TK-115b (cas 2, B845) : étapes du cahier technique, calculées par le code. Une étape Stack par couche qui a des
 * composants, l'hébergement toujours en dernier ; douze étapes au plus ; « comparer » par groupes de six choix ouverts.
 */
const componentsOf = (types: readonly string[], zones: number) =>
  types.map((type, i) => ({
    specId: `C-c${i}`,
    title: `c${i}`,
    zone: `Zone ${i % zones}`,
    type,
    owns: [],
    serves: [],
  }));
const times = (type: string, count: number) => Array.from({ length: count }, () => type);

const sources = (types: readonly string[], zones = 14, open = 0): LaunchSources => ({
  tag: "technical",
  pages: [],
  synthesis: null,
  risks: null,
  features: [],
  rules: [],
  roles: [],
  flows: [],
  architecture: {
    components: componentsOf(types, zones),
    archflows: [],
    decisions: Array.from({ length: 47 }, (_, i) => ({ specId: `ADR-${i}`, title: `D${i}` })),
    nfr: [],
  },
  technical: {
    stacks: [
      { specId: "ST-ferme", role: "Fermé", choice: "X" },
      ...Array.from({ length: open }, (_, i) => ({
        specId: `ST-o${i}`,
        role: `Ouvert ${i}`,
        choice: null,
      })),
    ],
    operations: [],
    requirements: [],
    environments: [],
    variables: [],
  },
});

const STAGING = [...times("service", 44), ...times("app", 8), ...times("queue", 8), "store", "ext"];
const STACK = [
  "Stack · Applications",
  "Stack · Services et API",
  "Stack · Données",
  "Stack · Services externes",
  "Stack · Hébergement et exploitation",
];
const CLOSING = ["Exigences", "Environnements", "Document · cahier technique"];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même fonction, un test par comportement
describe("étapes du cahier technique", () => {
  it.each(["complete", "all"])(
    "%s, 62 composants : 5 étapes Stack, 4 d'opérations et les 3 dernières",
    (mode) => {
      const zones = technicalSteps(mode, sources(STAGING));
      expect(zones).toHaveLength(12);
      expect(zones.slice(0, 5)).toEqual(STACK);
      expect(zones.slice(-3)).toEqual(CLOSING);
      expect(zones.slice(5, 9).join(" · ")).toContain("Zone 13");
      expect(zones.map((_, i) => technicalKindsAt(mode, i, zones))).toEqual(
        [...times("stack", 5), ...times("op", 4), "nfr", "env", "doc_section"].map((k) => [k]),
      );
    },
  );

  it("couche sans composant : pas d'étape ; 20 zones sans file ni service externe : 12 au plus", () => {
    const zones = technicalSteps(
      "complete",
      sources([...times("service", 15), ...times("app", 4), "store"], 20),
    );
    expect(zones.slice(0, 4)).toEqual([STACK[0], STACK[1], STACK[2], STACK[4]]);
    expect(zones).toHaveLength(12);
    expect(zones.slice(4, 9)).toHaveLength(5);
  });

  it("files seules : étape « Données » ; aucun composant : hébergement et une étape « API »", () => {
    expect(technicalSteps("complete", sources(["queue"], 1))).toEqual([
      STACK[2],
      STACK[4],
      "Zone 0",
      ...CLOSING,
    ]);
    expect(technicalSteps("complete", sources([]))).toEqual([STACK[4], "API", ...CLOSING]);
  });

  it("reprise d'un segment : les types se lisent dans les zones stockées, jamais d'un nom saisi", () => {
    const stored = [STACK[1] as string, STACK[4] as string, STACK[4] as string, ...CLOSING];
    expect(stored.map((_, i) => technicalKindsAt("complete", i, stored)[0])).toEqual([
      "stack",
      "stack",
      "op",
      "nfr",
      "env",
      "doc_section",
    ]);
    // Lancement parti avant les couches : sa seule étape « Stack » est la première.
    const former = ["Stack", "Réservation", ...CLOSING];
    expect(former.map((_, i) => technicalKindsAt("complete", i, former)[0]).slice(0, 2)).toEqual([
      "stack",
      "op",
    ]);
    expect(technicalKindsAt("compare", 2, ["a", "b", "c"])).toEqual(["stack"]);
    expect(technicalKindsAt("nfr", 0, ["Exigences"])).toEqual(["nfr"]);
  });

  it("comparer : un groupe de six au plus reste « Stack » ; 14 choix ouverts : trois étapes", () => {
    expect(technicalSteps("compare", sources([], 1, 6))).toEqual(["Stack"]);
    const current = sources([], 1, 14);
    const zones = technicalSteps("compare", current);
    expect(zones).toEqual([
      "Stack · choix à trancher 1/3",
      "Stack · choix à trancher 2/3",
      "Stack · choix à trancher 3/3",
    ]);
    expect(zones.map((zone) => compareChoicesOf(zone, current).length)).toEqual([6, 6, 2]);
    expect(compareChoicesOf(zones[1] ?? "", current)[0]?.specId).toBe("ST-o6");
    expect(compareChoicesOf("Stack", sources([], 1, 2))).toHaveLength(2);
    expect(technicalSteps("compare", sources([], 1, 100))).toHaveLength(12);
    expect(technicalSteps("nfr", current)).toEqual(["Exigences"]);
  });
});
