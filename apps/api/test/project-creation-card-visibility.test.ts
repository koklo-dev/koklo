import { describe, expect, it } from "vitest";
import { showsCreationCard } from "../src/project/project-creation-status.ts";

/**
 * TK-93 lot C : la carte de création reste en tête tant que le dépôt de spec n'existe pas. Un projet créé
 * sans compte GitHub (`skipped`, `no_account`) garde donc sa carte (action « Relier GitHub »).
 */
describe("showsCreationCard", () => {
  it.each(["pending", "running", "failed", "skipped"] as const)(
    "%s remplace la carte normale",
    (status) => {
      expect(showsCreationCard(status)).toBe(true);
    },
  );

  it("une création réussie redevient une carte normale", () => {
    expect(showsCreationCard("succeeded")).toBe(false);
  });
});
