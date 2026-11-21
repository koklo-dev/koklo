import { describe, expect, it } from "vitest";
import {
  ARCH_LAYOUT_PATH,
  EmitArchLayoutError,
  emitArchLayoutYaml,
  kindOf,
  LAYOUT_COORD_MAX,
  LAYOUT_MAX_ENTRIES,
  parseArchLayout,
} from "../src/index.ts";

/** TK-112 lot A (B542) : `architecture/_layout.yaml`, positions des composants et des acteurs du schéma. */
describe("architecture/_layout.yaml", () => {
  it("chemin ; mêmes plafonds que data/_layout.yaml", () => {
    expect(ARCH_LAYOUT_PATH).toBe("architecture/_layout.yaml");
    expect(LAYOUT_MAX_ENTRIES).toBe(500);
    expect(LAYOUT_COORD_MAX).toBe(20000);
  });

  it("n'est pas une entité du modèle : kindOf l'ignore", () => {
    expect(kindOf(ARCH_LAYOUT_PATH)).toBeUndefined();
  });

  it("émet un YAML trié par identifiant (composants C-, acteurs RL-)", () => {
    const text = emitArchLayoutYaml({
      "RL-client": { x: 0, y: 8 },
      "C-api": { x: 300, y: 40 },
    });
    expect(text).toBe(
      "positions:\n  C-api:\n    x: 300\n    y: 40\n  RL-client:\n    x: 0\n    y: 8\n",
    );
    expect(emitArchLayoutYaml({ "C-api": { x: 300, y: 40 }, "RL-client": { x: 0, y: 8 } })).toBe(
      text,
    );
  });

  it("relit ce qu'il a émis ; aucune position : fichier valide", () => {
    const positions = { "C-a": { x: 1, y: 2 }, "RL-b": { x: 20000, y: 0 } };
    expect(parseArchLayout(emitArchLayoutYaml(positions))).toEqual({ ok: true, positions });
    expect(parseArchLayout(emitArchLayoutYaml({}))).toEqual({ ok: true, positions: {} });
  });

  it.each([
    ["x négatif", { "C-a": { x: -1, y: 0 } }],
    ["y au-delà de 20000", { "C-a": { x: 0, y: 20001 } }],
    ["coordonnée décimale", { "C-a": { x: 0.5, y: 0 } }],
    ["identifiant de table", { "T-a": { x: 0, y: 0 } }],
    ["identifiant mal formé", { api: { x: 0, y: 0 } }],
    ["clé en trop", { "C-a": { x: 0, y: 0, z: 1 } }],
  ])("refuse à l'émission : %s", (_label, positions) => {
    expect(() => emitArchLayoutYaml(positions as never)).toThrow(EmitArchLayoutError);
  });

  it("refuse 501 entrées, accepte 500", () => {
    const many = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`C-c${i}`, { x: i, y: i }]));
    expect(() => emitArchLayoutYaml(many(501))).toThrow(EmitArchLayoutError);
    expect(emitArchLayoutYaml(many(500))).toContain("C-c499");
  });

  it("parseArchLayout : YAML invalide ou hors schéma : refus, sans exception", () => {
    expect(parseArchLayout("positions: [").ok).toBe(false);
    expect(parseArchLayout("positions:\n  C-a:\n    x: -3\n    y: 0\n").ok).toBe(false);
    expect(parseArchLayout("autre: 1\n").ok).toBe(false);
    expect(parseArchLayout("").ok).toBe(false);
  });
});
