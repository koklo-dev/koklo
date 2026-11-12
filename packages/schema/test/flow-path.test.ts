import { describe, expect, it } from "vitest";
import { isFlowPath, kindOf } from "../src/index.ts";

/**
 * TK-100 lot B (B325 g) : les parcours `design/flows/P-*.json` sont des entités JSON brutes, sans schéma. Ils ne
 * changent pas `kindOf` (le validateur les ignore toujours) : `isFlowPath` les désigne à l'indexeur.
 */
describe("isFlowPath", () => {
  it("reconnaît design/flows/P-*.json et rien d'autre", () => {
    expect(isFlowPath("design/flows/P-001-inscription.json")).toBe(true);
    expect(isFlowPath("design/flows/P-1.json")).toBe(true);
    expect(isFlowPath("design/flows/_layout.yaml")).toBe(false);
    expect(isFlowPath("design/flows/inscription.json")).toBe(false);
    expect(isFlowPath("design/flows/sous/P-1.json")).toBe(false);
    expect(isFlowPath("design/screens/S-1.json")).toBe(false);
  });

  it("n'est pas un genre du modèle : kindOf les ignore, le validateur aussi", () => {
    expect(kindOf("design/flows/P-001.json")).toBeUndefined();
  });
});
