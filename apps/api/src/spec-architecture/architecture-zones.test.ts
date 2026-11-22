import { describe, expect, it } from "vitest";
import {
  type ArchNode,
  archNodes,
  buildArchZone,
  buildArchZones,
  flowParticipants,
} from "./architecture-zones.ts";

/** TK-112 lot A (B546) : zones d'architecture, liens entre zones, acteurs d'une zone, zone ouverte, sur toute la tête. */
const node = (
  id: string,
  zone: string | undefined,
  dependsOn: { to: string; via?: string; async?: boolean }[] = [],
): ArchNode => ({
  id,
  name: id.slice(2).toUpperCase(),
  type: "service",
  zone,
  responsibility: `Rôle de ${id}`,
  dependsOn: dependsOn.map(({ to, via = "HTTP", async = false }) => ({ to, via, async })),
});

/** 34 composants dans 6 zones (6, 6, 6, 6, 5, 5) : la planche de la maquette. */
const ZONES = ["Accès", "Coeur", "Données", "Messagerie", "Paiement", "Externes"];
const THIRTY_FOUR: ArchNode[] = Array.from({ length: 34 }, (_, i) => node(`C-n${i}`, ZONES[i % 6]));

describe("archNodes : lecture tolérante de l'index", () => {
  it("nom, type, zone et dépendances d'un composant incomplet : valeurs neutres, jamais d'exception", () => {
    const rows = [
      { specId: "C-a", data: { titre: "Titre seul" } },
      { specId: "C-b", data: null },
      {
        specId: "C-c",
        data: {
          nom: "C",
          type: "ext",
          zone: "Z",
          responsabilite: "R\nsuite",
          depend_de: [
            { vers: "C-a", via: "SQL" },
            { vers: "C-b" },
            4,
            { vers: "C-a", via: "AMQP", mode: "asynchrone" },
          ],
        },
      },
    ];
    expect(archNodes(rows).map((n) => [n.id, n.name, n.type, n.zone, n.dependsOn])).toEqual([
      ["C-a", "Titre seul", "app", undefined, []],
      ["C-b", "C-b", "app", undefined, []],
      [
        "C-c",
        "C",
        "ext",
        "Z",
        [
          { to: "C-a", via: "SQL", async: false },
          { to: "C-a", via: "AMQP", async: true },
        ],
      ],
    ]);
  });
});

describe("flowParticipants : participants des flux indexés", () => {
  it("liste les participants, ignore les données illisibles", () => {
    expect(
      flowParticipants([
        { specId: "P-a", data: { participants: ["RL-client", "C-api", 4] } },
        { specId: "P-b", data: null },
      ]),
    ).toEqual([{ participants: ["RL-client", "C-api"] }, { participants: [] }]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même calcul, un test par comportement
describe("buildArchZones", () => {
  it("34 composants : 6 zones dans l'ordre d'apparition, aperçu 7 au plus, total des composants", () => {
    const { zones, componentCount } = buildArchZones(THIRTY_FOUR, [], []);
    expect(componentCount).toBe(34);
    expect(zones.map((z) => z.id)).toEqual([
      "acces",
      "coeur",
      "donnees",
      "messagerie",
      "paiement",
      "externes",
    ]);
    expect(zones.map((z) => z.componentCount)).toEqual([6, 6, 6, 6, 5, 5]);
    expect(zones.every((z) => z.preview.length <= 7)).toBe(true);
    const big = buildArchZones(
      Array.from({ length: 12 }, (_, i) => node(`C-g${i}`, "Gros")),
      [],
      [],
    ).zones[0];
    expect(big?.preview).toHaveLength(7);
    expect(big?.preview[0]).toBe("G0");
  });

  it("liens entre zones : une fois par paire de composants, quel que soit le sens ou le canal", () => {
    const nodes = [
      node("C-a1", "A", [{ to: "C-b1" }, { to: "C-b1", via: "AMQP", async: true }]),
      node("C-a2", "A", [{ to: "C-b1" }, { to: "C-b2" }]),
      node("C-b1", "B", [{ to: "C-a1" }]),
      node("C-b2", "B"),
      node("C-a3", "A", [{ to: "C-a1" }]),
    ];
    const { zones } = buildArchZones(nodes, [], []);
    // paires : a1-b1 (comptée une fois), a2-b1, a2-b2 ; a3-a1 reste dans la zone A
    expect(zones.find((z) => z.id === "a")?.links).toEqual([{ to: "b", count: 3 }]);
    expect(zones.find((z) => z.id === "b")?.links).toEqual([{ to: "a", count: 3 }]);
  });

  it("dépendance vers un composant absent ou vers soi-même : ignorée", () => {
    const { zones } = buildArchZones([node("C-a", "A", [{ to: "C-x" }, { to: "C-a" }])], [], []);
    expect(zones[0]?.links).toEqual([]);
  });

  it("composants sans zone : « Sans zone » en dernier", () => {
    const { zones } = buildArchZones([node("C-a", undefined), node("C-b", "B")], [], []);
    expect(zones.map((z) => [z.id, z.name])).toEqual([
      ["b", "B"],
      ["sans-zone", "Sans zone"],
    ]);
  });

  it("libellé et icône de architecture/_zones.yaml ; sinon icône par défaut", () => {
    const { zones } = buildArchZones(
      [node("C-a", "Données"), node("C-b", "Accès")],
      [],
      [{ nom: "Données", icone: "database" }],
    );
    expect(zones.map((z) => [z.name, z.icon])).toEqual([
      ["Données", "database"],
      ["Accès", "folder_open"],
    ]);
  });

  it("acteurs : rôles RL- des flux qui contiennent un composant de la zone, comptés une fois", () => {
    const flows = [
      { participants: ["RL-client", "C-a", "C-b"] },
      { participants: ["RL-client", "RL-admin", "C-a"] },
      { participants: ["RL-livreur", "C-c"] },
      { participants: ["C-a", "C-b"] },
    ];
    const nodes = [node("C-a", "A"), node("C-b", "B"), node("C-c", "C")];
    const { zones } = buildArchZones(nodes, flows, []);
    expect(zones.map((z) => [z.id, z.actorCount])).toEqual([
      ["a", 2],
      ["b", 1],
      ["c", 1],
    ]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même vue, un test par comportement
describe("buildArchZone", () => {
  const nodes = [
    node("C-a1", "A", [
      { to: "C-a2", via: "SQL" },
      { to: "C-b1", via: "AMQP", async: true },
    ]),
    node("C-a2", "A"),
    node("C-b1", "B", [{ to: "C-a1" }]),
  ];
  const flows = [{ participants: ["RL-client", "C-a1"] }];

  it("zone inconnue : undefined", () => {
    expect(buildArchZone(nodes, flows, [], "inconnue", new Map())).toBeUndefined();
  });

  it("composants, relations internes, liens sortants, acteurs nommés", () => {
    const view = buildArchZone(nodes, flows, [], "a", new Map([["RL-client", "Client"]]));
    expect(view?.zone).toEqual({ id: "a", name: "A", icon: "folder_open", componentCount: 2 });
    expect(view?.members.map((m) => m.id)).toEqual(["C-a1", "C-a2"]);
    expect(view?.relations).toEqual([{ from: "C-a1", to: "C-a2", via: "SQL" }]);
    expect(view?.outgoing).toEqual([{ zone: "b", count: 1 }]);
    expect(view?.actors).toEqual([{ id: "RL-client", name: "Client" }]);
    expect(view?.truncated).toBe(false);
  });

  it("une dépendance asynchrone entre composants rendus garde async: true", () => {
    const view = buildArchZone(
      [node("C-a", "A", [{ to: "C-b", via: "AMQP", async: true }]), node("C-b", "A")],
      [],
      [],
      "a",
      new Map(),
    );
    expect(view?.relations).toEqual([{ from: "C-a", to: "C-b", via: "AMQP", async: true }]);
  });

  it("TK-114c (B640) : crossRelations, liens avec les autres zones dans les deux sens, zone = l'autre zone", () => {
    const view = buildArchZone(nodes, flows, [], "a", new Map());
    expect(view?.crossRelations).toEqual([
      { from: "C-a1", to: "C-b1", via: "AMQP", async: true, zone: "b" },
      { from: "C-b1", to: "C-a1", via: "HTTP", zone: "b" },
    ]);
    const other = buildArchZone(
      [...nodes, node("C-c1", undefined, [{ to: "C-b1" }, { to: "C-fantome" }])],
      [],
      [],
      "b",
      new Map(),
    );
    expect(other?.crossRelations).toEqual([
      { from: "C-b1", to: "C-a1", via: "HTTP", zone: "a" },
      { from: "C-a1", to: "C-b1", via: "AMQP", async: true, zone: "a" },
      { from: "C-c1", to: "C-b1", via: "HTTP", zone: "sans-zone" },
    ]);
  });

  it("acteur sans nom connu : repli sur l'identifiant", () => {
    const view = buildArchZone(nodes, flows, [], "a", new Map());
    expect(view?.actors).toEqual([{ id: "RL-client", name: "RL-client" }]);
  });

  it("au-delà de 200 composants : 200 rendus, truncated, relations entre les rendus seulement", () => {
    const many = Array.from({ length: 205 }, (_, i) =>
      node(`C-m${i}`, "Gros", i === 0 ? [{ to: "C-m204" }, { to: "C-m1" }] : []),
    );
    const view = buildArchZone(many, [], [], "gros", new Map());
    expect(view?.members).toHaveLength(200);
    expect(view?.zone.componentCount).toBe(205);
    expect(view?.truncated).toBe(true);
    expect(view?.relations).toEqual([{ from: "C-m0", to: "C-m1", via: "HTTP" }]);
    expect(view?.crossRelations).toEqual([]);
  });
});
