import { describe, expect, it } from "vitest";
import { numberCriteria } from "./criteria.ts";

const existing = (...titles: [string, string][]) =>
  titles.map(([id, titre]) => ({ id, titre, etapes: [] }));
const submitted = (...titles: string[]) => titles.map((title) => ({ title, steps: [] }));
const ids = (criteria: { id: string; titre: string }[]) =>
  criteria.map((c) => `${c.id}:${c.titre}`);

describe("numberCriteria", () => {
  it("un titre inchangé garde son identifiant, un ajout reçoit max + 1", () => {
    const result = numberCriteria(existing(["AC-1", "A"], ["AC-3", "C"]), submitted("C", "A", "D"));
    expect(ids(result)).toEqual(["AC-3:C", "AC-1:A", "AC-4:D"]);
  });

  it("un identifiant supprimé n'est jamais réattribué", () => {
    const result = numberCriteria(existing(["AC-1", "A"], ["AC-2", "B"]), submitted("B", "E"));
    expect(ids(result)).toEqual(["AC-2:B", "AC-3:E"]);
  });

  it("deux titres identiques : correspondance dans l'ordre, une seule par critère existant", () => {
    const result = numberCriteria(
      existing(["AC-1", "Un"], ["AC-2", "Deux"]),
      submitted("Un", "Un", "Deux"),
    );
    expect(ids(result)).toEqual(["AC-1:Un", "AC-3:Un", "AC-2:Deux"]);
  });

  it("titres et textes d'étapes rognés, comparaison sensible à la casse", () => {
    const result = numberCriteria(existing(["AC-1", "Alpha"]), [
      { title: " alpha ", steps: [{ type: "quand", text: " agit " }] },
    ]);
    expect(result).toEqual([
      { id: "AC-2", titre: "alpha", etapes: [{ type: "quand", texte: "agit" }] },
    ]);
  });
});
