import { describe, expect, it } from "vitest";
import { PROJECT_TILE_HUES, projectInitialsOf, projectTileOf } from "../src/index.ts";

describe("TK-93 projectTileOf : tuile d'un projet", () => {
  it("initiales : première lettre des deux premiers mots, en majuscules", () => {
    expect(projectInitialsOf("Refonte portail client")).toBe("RP");
    expect(projectInitialsOf("  atelier   des  idées ")).toBe("AD");
  });

  it("un seul mot : ses deux premières lettres ; accents conservés", () => {
    expect(projectInitialsOf("Koklo")).toBe("KO");
    expect(projectInitialsOf("épicerie")).toBe("ÉP");
    expect(projectInitialsOf("x")).toBe("X");
  });

  it("un nom sans lettre ni chiffre donne « ? »", () => {
    expect(projectInitialsOf("---")).toBe("?");
    expect(projectInitialsOf("")).toBe("?");
  });

  it("colorKey : entier de 1 à 5, stable pour un même identifiant, indépendant du nom", () => {
    const id = "0196a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    const tile = projectTileOf(id, "Alpha Beta");
    expect(tile).toEqual(projectTileOf(id, "Alpha Beta"));
    expect(projectTileOf(id, "Autre nom").colorKey).toBe(tile.colorKey);
    expect(Number.isInteger(tile.colorKey)).toBe(true);
    expect(tile.colorKey).toBeGreaterThanOrEqual(1);
    expect(tile.colorKey).toBeLessThanOrEqual(PROJECT_TILE_HUES);
  });

  it("les 5 teintes sont toutes utilisées sur un échantillon d'identifiants", () => {
    const seen = new Set<number>();
    for (let n = 0; n < 200; n += 1) {
      seen.add(projectTileOf(`id-${n}`, "Projet").colorKey);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("valeur figée : le hachage ne change pas d'une version à l'autre", () => {
    expect(projectTileOf("a", "A").colorKey).toBe(projectTileOf("a", "B").colorKey);
    expect(projectTileOf("00000000-0000-7000-8000-000000000001", "X").colorKey).toBe(
      projectTileOf("00000000-0000-7000-8000-000000000001", "Y").colorKey,
    );
  });
});
