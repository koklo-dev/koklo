import { describe, expect, it } from "vitest";
import { kindOf, parseZones, ZONE_ICON_DEFAULT, ZONES_PATH } from "../src/index.ts";

/** TK-110 lot A (B484) : `data/_zones.yaml`, libellé et icône des zones, lu comme `_layout.yaml`, jamais indexé. */
describe("data/_zones.yaml", () => {
  it("chemin et icône par défaut", () => {
    expect(ZONES_PATH).toBe("data/_zones.yaml");
    expect(ZONE_ICON_DEFAULT).toBe("folder_open");
  });

  it("n'est pas une entité du modèle : kindOf l'ignore", () => {
    expect(kindOf(ZONES_PATH)).toBeUndefined();
  });

  it("relit les zones ; icône absente : folder_open", () => {
    const parsed = parseZones(
      "zones:\n  - { nom: Clients, icone: group }\n  - { nom: Paiements }\n",
    );
    expect(parsed).toEqual({
      ok: true,
      zones: [
        { nom: "Clients", icone: "group" },
        { nom: "Paiements", icone: "folder_open" },
      ],
    });
  });

  it("tolérant : une entrée illisible est écartée, les autres restent", () => {
    const parsed = parseZones(
      "zones:\n  - { nom: Clients }\n  - { icone: x }\n  - 3\n  - { nom: '' }\n",
    );
    expect(parsed).toEqual({ ok: true, zones: [{ nom: "Clients", icone: "folder_open" }] });
  });

  it("libellé plafonné à 80 caractères : entrée écartée au-delà", () => {
    const parsed = parseZones(
      `zones:\n  - { nom: "${"a".repeat(81)}" }\n  - { nom: "${"b".repeat(80)}" }\n`,
    );
    expect(parsed.ok && parsed.zones.map((zone) => zone.nom.length)).toEqual([80]);
  });

  it("fichier vide ou sans clé zones : aucune zone ; YAML illisible : refus sans exception", () => {
    expect(parseZones("")).toEqual({ ok: true, zones: [] });
    expect(parseZones("autre: 1\n")).toEqual({ ok: true, zones: [] });
    expect(parseZones("zones: [").ok).toBe(false);
  });
});
