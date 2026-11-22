import { describe, expect, it } from "vitest";
import {
  type ArchitectureCoverageInput,
  architectureChecks,
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
      rolesWithoutApp: [],
      directFlows: [],
      counts: {
        features: { covered: 1, total: 3 },
        flows: { covered: 1, total: 2 },
        tables: { covered: 2, total: 3 },
        links: { covered: 0, total: 2 },
        roles: { covered: 0, total: 0 },
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
      roles: { covered: 0, total: 0 },
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

/**
 * TK-114d (B651, B652) : forme de Toto, 5 rôles sans application d'entrée et 22 flux qui appellent directement un service.
 * Données inventées.
 */
const TOTO_ROLES = [
  "RL-colocataire",
  "RL-admin-colocation",
  "RL-visiteur",
  "RL-gestionnaire",
  "RL-invite",
];
const typed = (id: string, type: string, acteurs: string[] = []) => ({
  value: { id, possede: [], sert: [], type, acteurs },
});
const directFlow = (id: string, role: string, service: string) => ({
  value: {
    id,
    participants: [role, service],
    messages: [
      { bloc: "alt", libelle: "Sinon", messages: [{ de: service, vers: role, texte: "Refuse" }] },
      { bloc: "separateur", libelle: "Plus tard" },
    ],
  },
});
const TOTO: ArchitectureCoverageInput = {
  features: [],
  tables: [],
  flows: ids(...Array.from({ length: 22 }, (_, i) => `P-flux-${i + 1}`)),
  roles: ids(...TOTO_ROLES),
  components: [
    typed("C-ecran-liste-de-courses", "app"),
    typed("C-page-de-transparence", "app"),
    typed("C-courses", "service"),
    typed("C-base", "store"),
  ],
  archFlows: Array.from({ length: 22 }, (_, i) =>
    directFlow(`P-flux-${i + 1}`, TOTO_ROLES[i % 5] as string, i % 2 ? "C-courses" : "C-base"),
  ),
};

describe("architectureCoverage, rôles et flux directs (TK-114d)", () => {
  it("Toto : 5 rôles sans application, 0/5, 22 flux directs", () => {
    const coverage = architectureCoverage(TOTO);
    expect(coverage.rolesWithoutApp).toEqual(TOTO_ROLES);
    expect(coverage.counts.roles).toEqual({ covered: 0, total: 5 });
    expect(coverage.directFlows).toHaveLength(22);
    expect(coverage.directFlows[0]).toBe("P-flux-1");
  });

  it("rôle dans les acteurs d'une app, ou qui échange avec une app dans un flux : couvert", () => {
    const [app, other, ...rest] = TOTO.components;
    const coverage = architectureCoverage({
      ...TOTO,
      components: [
        typed(app?.value.id as string, "app", ["RL-colocataire", "RL-fantome"]),
        other as (typeof TOTO.components)[number],
        ...rest,
      ],
      archFlows: [
        ...TOTO.archFlows,
        {
          value: {
            id: "P-flux-23",
            messages: [{ de: "RL-invite", vers: "C-page-de-transparence" }],
          },
        },
      ],
    });
    expect(coverage.rolesWithoutApp).toEqual([
      "RL-admin-colocation",
      "RL-visiteur",
      "RL-gestionnaire",
    ]);
    expect(coverage.counts.roles).toEqual({ covered: 2, total: 5 });
  });

  it("acteurs d'un composant qui n'est pas une app : ignorés", () => {
    const coverage = architectureCoverage({
      ...TOTO,
      components: [typed("C-courses", "service", ["RL-colocataire"])],
    });
    expect(coverage.rolesWithoutApp).toContain("RL-colocataire");
  });

  it("un composant ext ou app, ou une cible inconnue, ne rend pas un flux direct", () => {
    const flow = (id: string, to: string) => ({
      value: { id, messages: [{ de: "RL-visiteur", vers: to }] },
    });
    const coverage = architectureCoverage({
      ...TOTO,
      components: [typed("C-mail", "ext"), typed("C-web", "app"), typed("C-api", "service")],
      archFlows: [
        flow("P-a", "C-mail"),
        flow("P-b", "C-web"),
        flow("P-c", "C-absent"),
        flow("P-d", "C-api"),
      ],
    });
    expect(coverage.directFlows).toEqual(["P-d"]);
  });

  it("architectureChecks : aucun nouveau code d'avertissement", () => {
    const spec = {
      features: [],
      tables: [],
      flows: TOTO.flows,
      components: TOTO.components.map(({ value }) => ({
        value: {
          id: value.id,
          type: value.type as "app",
          nom: value.id,
          zone: "Z",
          responsabilite: "R",
          possede: [],
          sert: [],
          acteurs: [],
          depend_de: [],
          decisions: [],
        },
      })),
      archFlows: TOTO.archFlows.map(({ value }) => ({ value: { id: value.id } })),
    };
    const codes = new Set(architectureChecks(spec).map((warning) => warning.code));
    expect([...codes].every((code) => code.startsWith("ARCH_"))).toBe(true);
    expect(codes.has("ARCH_FLOW_MISSING")).toBe(false);
    expect(codes.size).toBe(0);
  });
});
