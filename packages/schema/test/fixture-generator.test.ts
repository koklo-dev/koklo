import { describe, expect, it } from "vitest";
import {
  type Fixture,
  FixtureSchema,
  fixtureRowCount,
  generateFixturePage,
  generateFixtureRow,
} from "../src/index.ts";

/** TK-110 lot A (B485) : lignes générées déterministes par (graine, rang), accès direct, page en O(taille). */
const fixture = (generation: Record<string, unknown> = {}, lignes: unknown[] = []): Fixture =>
  FixtureSchema.parse({
    id: "FX-rdv",
    titre: "Rendez-vous",
    table: "T-rdv",
    lignes,
    generation: {
      graine: 1240,
      total: 1240,
      regles: {
        id: { type: "sequence", prefixe: "RDV-", debut: 1 },
        statut: { type: "choix", valeurs: ["prévu", "fait", "annulé"] },
        age: { type: "entier", min: 18, max: 90 },
        jour: { type: "date", debut: "2026-01-01", jours: 300 },
        nom: { type: "nom" },
        email: { type: "email" },
      },
      ...generation,
    },
  });

describe("generateFixtureRow", () => {
  it("mêmes (graine, rang) : même ligne, quel que soit l'ordre d'appel", () => {
    const f = fixture();
    const first = generateFixtureRow(f, 777);
    generateFixtureRow(f, 1);
    expect(generateFixtureRow(f, 777)).toEqual(first);
  });

  it("une autre graine change les lignes", () => {
    expect(generateFixtureRow(fixture({ graine: 7 }), 10)).not.toEqual(
      generateFixtureRow(fixture(), 10),
    );
  });

  it("applique chaque règle : séquence, choix, entier borné, date, nom, e-mail exemple.fr", () => {
    const f = fixture();
    for (let k = 1; k <= 200; k++) {
      const row = generateFixtureRow(f, k);
      expect(row?.id).toBe(`RDV-${k}`);
      expect(["prévu", "fait", "annulé"]).toContain(row?.statut);
      expect(row?.age).toBeGreaterThanOrEqual(18);
      expect(row?.age).toBeLessThanOrEqual(90);
      expect(String(row?.jour)).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(String(row?.nom).length).toBeGreaterThan(2);
      expect(String(row?.email)).toMatch(/^[a-z0-9.-]+@exemple\.fr$/);
    }
  });

  it("séquence sans préfixe : nombre ; début personnalisé", () => {
    const f = fixture({ regles: { n: { type: "sequence", debut: 100 } } });
    expect(generateFixtureRow(f, 3)).toEqual({ n: 102 });
  });

  it("date : jusqu'à début + jours, au plus", () => {
    const f = fixture({ regles: { d: { type: "date", debut: "2026-12-30", jours: 2 } } });
    const days = new Set(Array.from({ length: 60 }, (_, i) => generateFixtureRow(f, i + 1)?.d));
    expect([...days].sort()).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  it("les lignes stockées passent d'abord, la génération reprend au rang suivant", () => {
    const f = fixture({ total: 5 }, [{ id: "A" }, { id: "B" }]);
    expect(generateFixtureRow(f, 2)).toEqual({ id: "B" });
    expect(generateFixtureRow(f, 3)?.id).toBe("RDV-3");
  });

  it("hors du jeu (0, total + 1, sans generation) : undefined", () => {
    const f = fixture();
    expect(generateFixtureRow(f, 0)).toBeUndefined();
    expect(generateFixtureRow(f, 1241)).toBeUndefined();
    const stored = FixtureSchema.parse({
      id: "FX-a",
      titre: "A",
      table: "T-a",
      lignes: [{ a: 1 }],
    });
    expect(generateFixtureRow(stored, 1)).toEqual({ a: 1 });
    expect(generateFixtureRow(stored, 2)).toBeUndefined();
  });
});

describe("fixtureRowCount et generateFixturePage", () => {
  it("total du bloc generation, sinon nombre de lignes stockées", () => {
    expect(fixtureRowCount(fixture())).toBe(1240);
    expect(
      fixtureRowCount(
        FixtureSchema.parse({ id: "FX-a", titre: "A", table: "T-a", lignes: [{}, {}] }),
      ),
    ).toBe(2);
  });

  it.each([25, 50, 100])("pages de %i lignes cohérentes entre elles", (size) => {
    const f = fixture();
    const all = Array.from({ length: 1240 }, (_, i) => generateFixtureRow(f, i + 1));
    const pages = Math.ceil(1240 / size);
    const joined = Array.from({ length: pages }, (_, i) =>
      generateFixturePage(f, i + 1, size),
    ).flat();
    expect(joined).toEqual(all);
  });

  it("page 25 de 50 : lignes 1 201 à 1 240 ; au-delà de la fin : vide", () => {
    const f = fixture();
    const page = generateFixturePage(f, 25, 50);
    expect(page).toHaveLength(40);
    expect(page[0]?.id).toBe("RDV-1201");
    expect(page.at(-1)?.id).toBe("RDV-1240");
    expect(generateFixturePage(f, 26, 50)).toEqual([]);
  });
});
