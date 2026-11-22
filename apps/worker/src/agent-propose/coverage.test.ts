import { describe, expect, it } from "vitest";
import {
  type CoverageIndex,
  coverageIndexOf,
  coverageOf,
  knownComponents,
  type PublishedProposal,
  packetsOf,
} from "./coverage.ts";
import type { LaunchSources } from "./sources.ts";

/**
 * TK-114b (B616) : couverture calculée sur l'index et les propositions non refusées du lancement (une proposition `specId`
 * remplace le composant indexé), trous découpés en paquets de 15 fonctionnalités et 5 parcours.
 */
const titled = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    specId: `${prefix}${String(i + 1).padStart(3, "0")}`,
    title: `${prefix} ${i + 1}`,
  }));
const INDEX: CoverageIndex = {
  features: titled("F-", 3),
  flows: [
    { specId: "P-a", title: "A" },
    { specId: "P-b", title: "B" },
  ],
  tableIds: ["T-a", "T-b"],
  components: [
    {
      specId: "C-api",
      title: "API",
      zone: "Noyau",
      type: "service",
      owns: ["T-a"],
      serves: ["F-001"],
    },
  ],
  archflows: ["P-b"],
};
const COMPONENT = (specId: string) => ({
  specId,
  title: specId.slice(2),
  zone: "Noyau",
  type: "service",
  owns: [],
  serves: [],
});
const proposal = (
  kind: string,
  payload: Record<string, unknown>,
  status = "pending",
): PublishedProposal => ({
  id: `p-${kind}-${String(payload.name ?? payload.flow)}`,
  kind,
  zone: "Noyau",
  title: String(payload.name ?? payload.flow),
  status,
  applied: false,
  payload,
});

describe("coverageIndexOf", () => {
  it("lit fonctionnalités, parcours, toutes les tables, composants avec liens et flux techniques des sources", () => {
    const sources = {
      tag: "architecture",
      pages: [],
      synthesis: null,
      risks: null,
      features: [{ specId: "F-001", title: "Connexion", criteria: [] }],
      rules: [],
      roles: [],
      flows: [{ specId: "P-a", title: "A" }],
      tables: [{ specId: "T-a", title: "A", zone: null, fields: [] }],
      tableIds: ["T-a", "T-b"],
      architecture: {
        components: [
          { specId: "C-api", title: "API", zone: null, type: "service", owns: [], serves: [] },
        ],
        archflows: [{ specId: "P-a", title: "P-a" }],
        decisions: [],
        nfr: [],
      },
    } satisfies LaunchSources;
    expect(coverageIndexOf(sources)).toEqual({
      features: [{ specId: "F-001", title: "Connexion" }],
      flows: [{ specId: "P-a", title: "A" }],
      tableIds: ["T-a", "T-b"],
      components: sources.architecture.components,
      archflows: ["P-a"],
      technicalFlows: sources.architecture.archflows,
      roles: [],
    });
  });
});

describe("coverageOf", () => {
  it("index seul : trous et compteurs", () => {
    const coverage = coverageOf(INDEX, []);
    expect(coverage.unservedFeatures).toEqual(["F-002", "F-003"]);
    expect(coverage.missingFlows).toEqual(["P-a"]);
    expect(coverage.unownedTables).toEqual(["T-b"]);
  });

  it("propositions non refusées comptées ; une proposition specId remplace le composant indexé", () => {
    const proposals = [
      proposal("component", { name: "Cache", serves: ["F-002"], owns: ["T-b"] }),
      proposal("component", { name: "Vieux", serves: ["F-003"] }, "rejected"),
      proposal("archflow", { flow: "P-a" }, "accepted"),
      proposal("component", { specId: "C-api", name: "API", serves: ["F-003"], owns: [] }),
    ];
    const coverage = coverageOf(INDEX, proposals);
    expect(coverage.unservedFeatures).toEqual(["F-001"]);
    expect(coverage.missingFlows).toEqual([]);
    expect(coverage.unownedTables).toEqual(["T-a"]);
    expect(coverage.counts.features).toEqual({ covered: 2, total: 3 });
  });

  it("TK-114c (B633) : liens de l'index et du lancement ; une specId sans dependsOn garde ceux de l'index", () => {
    const index: CoverageIndex = {
      ...INDEX,
      components: [
        { ...COMPONENT("C-api"), dependsOn: [{ to: "C-db", via: "SQL" }] },
        COMPONENT("C-db"),
        COMPONENT("C-seul"),
        { ...COMPONENT("C-mail"), type: "ext" },
      ],
    };
    expect(coverageOf(index, []).isolatedComponents).toEqual(["C-seul"]);
    expect(coverageOf(index, []).counts.links).toEqual({ covered: 2, total: 3 });
    const kept = coverageOf(index, [proposal("component", { specId: "C-api", name: "API" })]);
    expect(kept.isolatedComponents).toEqual(["C-seul"]);
    const relinked = coverageOf(index, [
      proposal("component", { specId: "C-api", name: "API", dependsOn: [] }),
      proposal("component", {
        name: "Cache",
        type: "store",
        dependsOn: [{ to: "C-seul", via: "TCP" }],
      }),
      proposal("component", { name: "Rejet", dependsOn: [{ to: "C-db", via: "x" }] }, "rejected"),
    ]);
    expect(relinked.isolatedComponents).toEqual(["C-api", "C-db"]);
    expect(relinked.counts.links).toEqual({ covered: 2, total: 4 });
  });
});

describe("packetsOf", () => {
  it("174 fonctionnalités et 22 parcours : 12 paquets de 15 F, les parcours 5 par 5 dans les premiers", () => {
    const index = { ...INDEX, features: titled("F-", 174), flows: titled("P-", 22) };
    const holes = {
      unservedFeatures: index.features.map((f) => f.specId),
      missingFlows: index.flows.map((f) => f.specId),
    };
    const packets = packetsOf(index, { ...holes, isolatedComponents: [] }, []);
    expect(packets.map((p) => [p.features.length, p.flows.length])).toEqual([
      [15, 5],
      [15, 5],
      [15, 5],
      [15, 5],
      [15, 2],
      [15, 0],
      [15, 0],
      [15, 0],
      [15, 0],
      [15, 0],
      [15, 0],
      [9, 0],
    ]);
    expect(packets[0]?.features[0]).toEqual({ specId: "F-001", title: "F- 1" });
  });

  it("TK-114c (B634) : composants isolés 10 par paquet, dans l'ordre des composants connus", () => {
    const known = Array.from({ length: 23 }, (_, i) => ({
      specId: `C-t${String(i + 1).padStart(2, "0")}`,
      title: `T ${i + 1}`,
      zone: `Zone ${(i % 8) + 1}`,
      type: "service",
    }));
    const isolated = known.slice(3).map((item) => item.specId);
    const holes = { unservedFeatures: ["F-001"], missingFlows: [], isolatedComponents: isolated };
    const packets = packetsOf(INDEX, holes, known);
    expect(packets.map((p) => [p.features.length, p.components.length])).toEqual([
      [1, 10],
      [0, 10],
    ]);
    expect(packets[0]?.components[0]).toEqual({
      specId: "C-t04",
      title: "T 4",
      zone: "Zone 4",
      type: "service",
    });
    expect(packets[1]?.components.at(-1)?.specId).toBe("C-t23");
  });
});

describe("knownComponents", () => {
  it("index puis lancement (non refusés), une fois chacun, jamais la responsabilité", () => {
    const proposals = [
      proposal("component", { name: "Cache", zone: "Noyau", type: "queue", responsibility: "R" }),
      proposal("component", { name: "Vieux", zone: "Noyau", type: "store" }, "rejected"),
      proposal("component", { specId: "C-api", name: "API", zone: "Noyau", type: "service" }),
    ];
    expect(knownComponents(INDEX, proposals)).toEqual([
      { specId: "C-api", title: "API", zone: "Noyau", type: "service" },
      { specId: "C-cache", title: "Cache", zone: "Noyau", type: "queue" },
    ]);
  });
});

/** TK-114d (B651, B653) : rôles et applications d'entrée dans la couverture, rôles sans application 5 par paquet. */
describe("couverture des rôles (TK-114d)", () => {
  const ROLES = titled("RL-r", 7).map(({ specId, title }) => ({
    specId: specId.replace(/0+(\d)$/, "$1"),
    title,
  }));
  const WITH_ROLES: CoverageIndex = {
    ...INDEX,
    roles: ROLES,
    components: [...INDEX.components, { ...COMPONENT("C-web"), type: "app" }],
    technicalFlows: [
      {
        specId: "P-b",
        title: "P-b",
        participants: ["RL-r1", "C-api"],
        messages: [{ from: "RL-r1", to: "C-api", text: "Appelle" }],
      },
    ],
  };

  it("index : aucun rôle couvert, P-b direct ; actors d'une app proposée, flux repris : couverts", () => {
    const before = coverageOf(WITH_ROLES, []);
    expect(before.counts.roles).toEqual({ covered: 0, total: 7 });
    expect(before.directFlows).toEqual(["P-b"]);
    const proposals = [
      proposal("component", { specId: "C-web", name: "Web", type: "app", actors: ["RL-r2"] }),
      proposal("component", { name: "Mobile", type: "app", actors: ["RL-r3"] }, "rejected"),
      proposal("archflow", {
        specId: "P-b",
        flow: "P-b",
        messages: [
          { from: "RL-r1", to: "C-web", text: "Appelle" },
          { from: "C-web", to: "C-api", text: "Appelle" },
        ],
      }),
    ];
    const after = coverageOf(WITH_ROLES, proposals);
    expect(after.rolesWithoutApp).toEqual(["RL-r3", "RL-r4", "RL-r5", "RL-r6", "RL-r7"]);
    expect(after.directFlows).toEqual([]);
  });

  it("rôles sans application : 5 par paquet, avec les composants appelés", () => {
    const roles = ROLES.map((role) => ({ ...role, calls: ["C-api"] }));
    const holes = {
      unservedFeatures: [],
      missingFlows: [],
      isolatedComponents: [],
      rolesWithoutApp: ROLES.map((role) => role.specId),
    };
    const packets = packetsOf(WITH_ROLES, holes, [], roles);
    expect(packets.map((p) => p.roles?.length)).toEqual([5, 2]);
    expect(packets[0]?.roles?.[0]).toEqual({ specId: "RL-r1", title: "RL-r 1", calls: ["C-api"] });
  });
});
