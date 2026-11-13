import { describe, expect, it } from "vitest";
import {
  EmitLayoutError,
  emitLayoutYaml,
  kindOf,
  LAYOUT_COORD_MAX,
  LAYOUT_MAX_ENTRIES,
  LAYOUT_PATH,
  parseLayout,
} from "../src/index.ts";

/** TK-108 lot B (B418) : `data/_layout.yaml`, positions des tables du diagramme, triées par identifiant, entières. */
describe("data/_layout.yaml", () => {
  it("chemin et plafonds", () => {
    expect(LAYOUT_PATH).toBe("data/_layout.yaml");
    expect(LAYOUT_MAX_ENTRIES).toBe(500);
    expect(LAYOUT_COORD_MAX).toBe(20000);
  });

  it("n'est pas une entité du modèle : kindOf l'ignore", () => {
    expect(kindOf(LAYOUT_PATH)).toBeUndefined();
  });

  it("émet un YAML trié par identifiant, quel que soit l'ordre d'entrée", () => {
    const text = emitLayoutYaml({ "T-reservation": { x: 300, y: 40 }, "T-client": { x: 0, y: 8 } });
    expect(text).toBe(
      "positions:\n  T-client:\n    x: 0\n    y: 8\n  T-reservation:\n    x: 300\n    y: 40\n",
    );
    expect(emitLayoutYaml({ "T-client": { x: 0, y: 8 }, "T-reservation": { x: 300, y: 40 } })).toBe(
      text,
    );
  });

  it("relit ce qu'il a émis ; aucune position : fichier valide, liste vide", () => {
    const positions = { "T-a": { x: 1, y: 2 }, "T-b": { x: 20000, y: 0 } };
    expect(parseLayout(emitLayoutYaml(positions))).toEqual({ ok: true, positions });
    expect(parseLayout(emitLayoutYaml({}))).toEqual({ ok: true, positions: {} });
  });

  it.each([
    ["x négatif", { "T-a": { x: -1, y: 0 } }],
    ["y au-delà de 20000", { "T-a": { x: 0, y: 20001 } }],
    ["coordonnée décimale", { "T-a": { x: 0.5, y: 0 } }],
    ["identifiant mal formé", { client: { x: 0, y: 0 } }],
    ["clé en trop", { "T-a": { x: 0, y: 0, z: 1 } }],
  ])("refuse à l'émission : %s", (_label, positions) => {
    expect(() => emitLayoutYaml(positions as never)).toThrow(EmitLayoutError);
  });

  it("refuse 501 entrées, accepte 500", () => {
    const many = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`T-t${i}`, { x: i, y: i }]));
    expect(() => emitLayoutYaml(many(501))).toThrow(EmitLayoutError);
    expect(emitLayoutYaml(many(500))).toContain("T-t499");
  });

  it("parseLayout : YAML invalide ou hors schéma : refus, sans exception", () => {
    expect(parseLayout("positions: [").ok).toBe(false);
    expect(parseLayout("positions:\n  T-a:\n    x: -3\n    y: 0\n").ok).toBe(false);
    expect(parseLayout("autre: 1\n").ok).toBe(false);
    expect(parseLayout("").ok).toBe(false);
  });
});
