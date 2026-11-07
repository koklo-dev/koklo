import { AI_USAGES } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { ANTHROPIC_DEFAULT_MODEL, launchCatalog } from "../src/index.ts";

describe("TK-95 D · catalogue qualifié au lancement (A4)", () => {
  it("un seul modèle : Anthropic Sonnet, pour les quatre usages, non économique", () => {
    expect(launchCatalog().list()).toEqual([
      {
        provider: "anthropic",
        model: ANTHROPIC_DEFAULT_MODEL,
        usages: [...AI_USAGES],
        economy: false,
      },
    ]);
  });

  it("le catalogue rendu n'est pas modifiable de l'extérieur", () => {
    const first = launchCatalog().list();
    expect(Object.isFrozen(first)).toBe(true);
    expect(launchCatalog().list()).toEqual(first);
  });
});
