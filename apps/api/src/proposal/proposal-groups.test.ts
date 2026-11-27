import { describe, expect, it } from "vitest";
import {
  buildGroups,
  GROUPING_THRESHOLD,
  type GroupCount,
  groupFilterOf,
  groupKeyOf,
} from "./proposal-groups.ts";

const count = (
  kind: GroupCount["kind"],
  zone: string,
  status: GroupCount["status"],
  n: number,
  first = 0,
): GroupCount => ({ kind, zone, status, n, first });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("TK-99a groupes de propositions", () => {
  it("le seuil de groupement est 30", () => {
    expect(GROUPING_THRESHOLD).toBe(30);
  });

  it("jusqu'à 30 propositions : un seul groupe « all », comptes par statut", () => {
    const groups = buildGroups(
      [count("feature", "A", "pending", 10), count("criteria", "B", "accepted", 5)],
      "type_zone",
    );
    expect(groups).toEqual([
      {
        key: "all",
        label: "Toutes les propositions",
        total: 15,
        accepted: 5,
        rejected: 0,
        pending: 10,
      },
    ]);
  });

  it("au-delà de 30, par type et zone, dans l'ordre des types puis de la première position", () => {
    const groups = buildGroups(
      [
        count("criteria", "Facturation", "pending", 10, 50),
        count("feature", "Paiements", "pending", 20, 20),
        count("feature", "Paiements", "rejected", 5, 25),
        count("feature", "Réservations", "accepted", 2, 0),
      ],
      "type_zone",
    );
    expect(groups.map((g) => g.key)).toEqual([
      "feature:Réservations",
      "feature:Paiements",
      "criteria:Facturation",
    ]);
    expect(groups[1]).toEqual({
      key: "feature:Paiements",
      label: "Paiements",
      total: 25,
      accepted: 0,
      rejected: 5,
      pending: 20,
    });
  });

  it("par type seulement : une entrée par type, libellé du type", () => {
    const groups = buildGroups(
      [
        count("feature", "A", "pending", 20),
        count("feature", "B", "pending", 20),
        count("rule", "A", "pending", 3),
      ],
      "type",
    );
    expect(groups.map((g) => [g.key, g.label, g.total])).toEqual([
      ["feature", "Fonctionnalités", 40],
      ["rule", "Règles", 3],
    ]);
  });

  it("types des Données (TK-107) : libellés français, ordre table, relations, jeux ; clés de groupe valides", () => {
    const groups = buildGroups(
      [
        count("fixtures", "A", "pending", 20, 2),
        count("relations", "A", "pending", 1, 1),
        count("table", "A", "pending", 20, 0),
      ],
      "type",
    );
    expect(groups.map((g) => [g.key, g.label, g.total])).toEqual([
      ["table", "Tables", 20],
      ["relations", "Relations", 1],
      ["fixtures", "Jeux d'exemple", 20],
    ]);
    expect(groupFilterOf("fixtures:Réservations")).toEqual({
      kind: "fixtures",
      zone: "Réservations",
    });
  });

  it("clé et filtre de groupe : aller-retour, zone contenant « : », « all », clé inconnue", () => {
    expect(groupKeyOf("feature", "A:B", "type_zone")).toBe("feature:A:B");
    expect(groupFilterOf("feature:A:B")).toEqual({ kind: "feature", zone: "A:B" });
    expect(groupFilterOf("criteria")).toEqual({ kind: "criteria" });
    expect(groupFilterOf("all")).toEqual({});
    expect(groupFilterOf("inconnu")).toBeNull();
    expect(groupFilterOf("inconnu:Zone")).toBeNull();
  });
});

/** TK-110 (B487) : relations et jeux d'exemple se relisent ensemble, dans le groupe « Relations et jeux d'exemple ». */
describe("TK-110 groupe « links »", () => {
  const data = [
    count("table", "Rendez-vous", "pending", 20, 0),
    count("table", "Clients", "pending", 20, 20),
    count("relations", "Rendez-vous", "pending", 4, 40),
    count("relations", "Clients", "accepted", 2, 44),
    count("fixtures", "Rendez-vous", "pending", 21, 46),
  ];

  it("par type et zone : relations et jeux fusionnent sous la clé links, après les tables", () => {
    const groups = buildGroups(data, "type_zone");
    expect(groups.map((g) => [g.key, g.label, g.total, g.pending, g.accepted])).toEqual([
      ["table:Rendez-vous", "Zone Rendez-vous", 20, 20, 0],
      ["table:Clients", "Zone Clients", 20, 20, 0],
      ["links", "Relations et jeux d'exemple", 27, 25, 2],
    ]);
  });

  it("clé links : la clé de groupe d'une relation ou d'un jeu, quelle que soit la zone ; autres types inchangés", () => {
    expect(groupKeyOf("relations", "Clients", "type_zone")).toBe("links");
    expect(groupKeyOf("fixtures", "A", "type_zone")).toBe("links");
    expect(groupKeyOf("table", "A", "type_zone")).toBe("table:A");
    expect(groupKeyOf("relations", "A", "type")).toBe("relations");
  });

  it("par type : relations et jeux restent deux groupes", () => {
    expect(buildGroups(data, "type").map((g) => g.key)).toEqual(["table", "relations", "fixtures"]);
  });

  it("filtre de la clé links : les types relations et jeux d'exemple, sans zone", () => {
    expect(groupFilterOf("links")).toEqual({ kinds: ["relations", "fixtures"] });
  });

  it("sous le seuil : toujours un seul groupe « all »", () => {
    expect(buildGroups([count("relations", "A", "pending", 3)], "type_zone")[0]?.key).toBe("all");
  });
});

/** TK-111 : l'Architecture se relit par type (maquette 13 : Document, Composants, Flux, Décisions), quelle que soit la zone. */
describe("TK-111 groupes de l'Architecture", () => {
  const data = [
    count("adr", "Noyau", "pending", 4, 40),
    count("archflow", "Noyau", "pending", 6, 34),
    count("component", "Noyau", "pending", 20, 0),
    count("component", "Interfaces", "accepted", 10, 20),
    count("doc_section", "Noyau", "pending", 3, 31),
  ];

  it("par type et zone : un groupe par type, libellés français, document d'abord", () => {
    const groups = buildGroups(data, "type_zone");
    expect(groups.map((g) => [g.key, g.label, g.total])).toEqual([
      ["doc_section", "Document · vue d'ensemble", 3],
      ["component", "Composants", 30],
      ["archflow", "Flux", 6],
      ["adr", "Décisions", 4],
    ]);
  });

  it("clé de groupe : le type seul, zone ignorée ; le filtre rend le type", () => {
    expect(groupKeyOf("component", "Interfaces", "type_zone")).toBe("component");
    expect(groupKeyOf("adr", "A", "type")).toBe("adr");
    expect(groupFilterOf("doc_section")).toEqual({ kind: "doc_section" });
    expect(groupFilterOf("component")).toEqual({ kind: "component" });
  });

  it("sous le seuil : un seul groupe « all »", () => {
    expect(buildGroups([count("component", "A", "pending", 3)], "type_zone")[0]?.key).toBe("all");
  });
});

describe("TK-114g (contrat 3.16.0, B700) : déjà présentes comptées à part", () => {
  const present = (kind: GroupCount["kind"], zone: string, n: number): GroupCount => ({
    ...count(kind, zone, "rejected", n),
    discardReason: "already_present",
  });

  it("alreadyPresent hors des rejets humains ; total inchangé", () => {
    const groups = buildGroups(
      [
        count("doc_section", "Noyau", "pending", 1),
        count("doc_section", "Noyau", "rejected", 2),
        present("doc_section", "Noyau", 1),
      ],
      "type_zone",
    );
    expect(groups).toEqual([
      {
        key: "all",
        label: "Toutes les propositions",
        total: 4,
        accepted: 0,
        rejected: 2,
        pending: 1,
        alreadyPresent: 1,
      },
    ]);
  });

  it("aucune déjà présente : pas de champ alreadyPresent", () => {
    const [group] = buildGroups([count("component", "A", "pending", 3)], "type_zone");
    expect(group).not.toHaveProperty("alreadyPresent");
  });
});

/** TK-115 (B730) : le cahier technique se relit par type : document, stack, opérations, exigences, environnements. */
describe("TK-115 groupes du cahier technique", () => {
  const data = [
    count("env", "Environnements", "pending", 3, 40),
    count("op", "Réservation", "pending", 20, 10),
    count("stack", "Stack", "pending", 10, 0),
    count("nfr", "Exigences", "pending", 4, 30),
    count("doc_section", "Document", "pending", 2, 50),
  ];

  it("par type même demandé par zone, document en tête, libellé du cahier technique", () => {
    expect(buildGroups(data, "type_zone", "technical").map((g) => [g.key, g.label])).toEqual([
      ["doc_section", "Document · cahier technique"],
      ["stack", "Stack"],
      ["op", "Opérations de l'API"],
      ["nfr", "Exigences"],
      ["env", "Environnements"],
    ]);
    expect(groupKeyOf("op", "Réservation", "type_zone")).toBe("op");
    expect(groupFilterOf("env")).toEqual({ kind: "env" });
  });

  it("architecture inchangée : « Document · vue d'ensemble »", () => {
    const groups = buildGroups(
      [count("doc_section", "A", "pending", 40, 0)],
      "type",
      "architecture",
    );
    expect(groups[0]?.label).toBe("Document · vue d'ensemble");
  });
});
