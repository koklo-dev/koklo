import { describe, expect, it } from "vitest";
import {
  buildZone,
  buildZones,
  NO_ZONE_ID,
  NO_ZONE_NAME,
  type ZoneTable,
  zoneIdOf,
  zoneTables,
} from "./data-zones.ts";

/** TK-110 lot A (B483, B484) : zones du modèle, liens entre zones, zone ouverte, calculés sur toute la tête. */
const table = (
  id: string,
  zone: string | undefined,
  vers: string[] = [],
  fk: string[] = [],
): ZoneTable => {
  const [parsed] = zoneTables([
    {
      specId: id,
      data: {
        nom: id.slice(2),
        ...(zone === undefined ? {} : { zone }),
        champs: [
          { nom: "id", type: "uuid", cle: "primaire" },
          ...fk.map((target, i) => ({ nom: `fk${i}`, type: `ref(${target})` })),
        ],
        relations: vers.map((to) => ({ vers: to, cardinalite: "1 → n" })),
      },
    },
  ]);
  return parsed as ZoneTable;
};

const TABLES: ZoneTable[] = [
  table("T-a1", "Rendez-vous", ["T-b1"]),
  table("T-a2", "Rendez-vous", ["T-b1", "T-b2"]),
  table("T-b1", "Clients et fidélité"),
  table("T-b2", "Clients et fidélité", ["T-a1"]),
  table("T-c1", undefined, [], ["T-a1"]),
];

describe("zoneTables : lecture tolérante", () => {
  it("nom, zone et relations d'une table incomplète : valeurs neutres, jamais d'exception", () => {
    const rows = [
      { specId: "T-a", data: { titre: "Titre seul" } },
      { specId: "T-b", data: null },
      { specId: "T-c", data: { nom: "C", zone: 3, champs: "x", relations: [{ vers: "T-a" }, 4] } },
    ];
    expect(zoneTables(rows).map((t) => [t.id, t.name, t.zone, t.relations])).toEqual([
      ["T-a", "Titre seul", undefined, []],
      ["T-b", "T-b", undefined, []],
      ["T-c", "C", undefined, []],
    ]);
  });
});

describe("zoneIdOf", () => {
  it("dérive un identifiant stable du libellé (accents, casse, ponctuation)", () => {
    expect(zoneIdOf("Clients et fidélité")).toBe("clients-et-fidelite");
    expect(zoneIdOf("  Paiement & caisse ! ")).toBe("paiement-caisse");
    expect(zoneIdOf(undefined)).toBe(NO_ZONE_ID);
    expect(zoneIdOf("!!!")).toBe("zone");
    expect(zoneIdOf("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("buildZones", () => {
  const { zones, tableCount } = buildZones(TABLES, [
    { nom: "Rendez-vous", icone: "event" },
    { nom: "Clients et fidélité", icone: "person" },
  ]);

  it("une zone par libellé, dans l'ordre d'apparition des tables, « Sans zone » comprise", () => {
    expect(tableCount).toBe(5);
    expect(zones.map((zone) => [zone.id, zone.name, zone.tableCount])).toEqual([
      ["rendez-vous", "Rendez-vous", 2],
      ["clients-et-fidelite", "Clients et fidélité", 2],
      [NO_ZONE_ID, NO_ZONE_NAME, 1],
    ]);
  });

  it("l'icône vient de data/_zones.yaml, sinon folder_open", () => {
    expect(zones.map((zone) => zone.icon)).toEqual(["event", "person", "folder_open"]);
  });

  it("aperçu : les noms des premières tables, 7 au plus", () => {
    expect(zones[0]?.preview).toEqual(["a1", "a2"]);
    const many = Array.from({ length: 12 }, (_, i) => table(`T-m${i}`, "Z"));
    expect(buildZones(many, []).zones[0]?.preview).toHaveLength(7);
  });

  it("liens entre zones : relations déclarées et clés étrangères, comptées dans les deux sens", () => {
    // rendez-vous <-> clients : a1-b1, a2-b1, a2-b2, b2-a1 = 4 ; rendez-vous <-> sans zone : c1-a1 (clé étrangère) = 1.
    expect(zones[0]?.links).toEqual([
      { to: "clients-et-fidelite", count: 4 },
      { to: NO_ZONE_ID, count: 1 },
    ]);
    expect(zones[1]?.links).toEqual([{ to: "rendez-vous", count: 4 }]);
    expect(zones[2]?.links).toEqual([{ to: "rendez-vous", count: 1 }]);
  });

  it("une relation vers une table inconnue ou dans la même zone n'est pas un lien", () => {
    const only = buildZones([table("T-x", "Z", ["T-y", "T-ghost"]), table("T-y", "Z")], []);
    expect(only.zones[0]?.links).toEqual([]);
  });

  it("deux libellés au même identifiant forment une seule zone", () => {
    const merged = buildZones([table("T-p", "Paiement"), table("T-q", "paiement")], []);
    expect(merged.zones).toHaveLength(1);
    expect(merged.zones[0]).toMatchObject({ name: "Paiement", tableCount: 2 });
  });

  it("sans table : aucune zone", () => {
    expect(buildZones([], [])).toEqual({ zones: [], tableCount: 0 });
  });
});

describe("buildZone", () => {
  it("tables et relations de la zone, liens sortants égaux aux liens de la vue des zones", () => {
    const view = buildZone(TABLES, [], "rendez-vous");
    expect(view?.zone).toMatchObject({ id: "rendez-vous", name: "Rendez-vous", tableCount: 2 });
    expect(view?.members.map((member) => member.id)).toEqual(["T-a1", "T-a2"]);
    expect(view?.relations).toEqual([]);
    expect(view?.outgoing).toEqual([
      { zone: "clients-et-fidelite", count: 4 },
      { zone: NO_ZONE_ID, count: 1 },
    ]);
    expect(view?.truncated).toBe(false);
  });

  it("relations internes à la zone, y compris celles des clés étrangères", () => {
    const view = buildZone(
      [table("T-p", "Z", ["T-q"]), table("T-q", "Z"), table("T-r", "Z", [], ["T-q"])],
      [],
      "z",
    );
    expect(view?.relations).toEqual([
      { from: "T-p", to: "T-q", cardinality: "1 → n" },
      { from: "T-r", to: "T-q", cardinality: "n → 1" },
    ]);
  });

  it("plus de 200 tables : 200 rendues, truncated, compte complet", () => {
    const many = Array.from({ length: 230 }, (_, i) => table(`T-m${i}`, "Z"));
    const view = buildZone(many, [], "z");
    expect(view?.members).toHaveLength(200);
    expect(view?.truncated).toBe(true);
    expect(view?.zone.tableCount).toBe(230);
  });

  it("zone inconnue : undefined", () => {
    expect(buildZone(TABLES, [], "inconnue")).toBeUndefined();
  });
});
