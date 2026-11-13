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
