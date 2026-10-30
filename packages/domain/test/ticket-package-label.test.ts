import { describe, expect, it } from "vitest";
import { assertNoPackageLabel, InvalidTicketError } from "../src/index.ts";

describe("étiquette pkg:* refusée (le paquet est le champ pkg)", () => {
  it("accepte des étiquettes ordinaires, une liste vide ou absente", () => {
    expect(() => assertNoPackageLabel(["front", "urgent", "mypkg:x"])).not.toThrow();
    expect(() => assertNoPackageLabel([])).not.toThrow();
    expect(() => assertNoPackageLabel(undefined)).not.toThrow();
  });

  it("refuse toute étiquette commençant par pkg: avec le champ labels", () => {
    for (const labels of [["pkg:web"], ["a", "pkg:"], ["pkg:inconnu", "b"]]) {
      expect(() => assertNoPackageLabel(labels)).toThrow(
        expect.objectContaining({ name: "InvalidTicketError", field: "labels" }),
      );
    }
    expect(() => assertNoPackageLabel(["pkg:web"])).toThrow(InvalidTicketError);
  });
});
