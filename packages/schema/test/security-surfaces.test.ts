import { describe, expect, it } from "vitest";
import { exposedSurfaces, surfacesToComplete, unansweredRequirements } from "../src/index.ts";

/** TK-117 lot B (B806) : ce que l'agent de la Sécurité a à traiter, partagé par l'API et le worker. */
describe("surfaces et exigences à traiter", () => {
  it("surfaces servies par les opérations, sinon toutes les fonctionnalités, plus l'API", () => {
    const operations = [{ sert: ["F-009", "F-004"] }, { sert: ["F-004"] }, {}];
    expect(exposedSurfaces(operations, ["F-001"])).toEqual(["F-004", "F-009", "api"]);
    expect(exposedSurfaces([], ["F-002", "F-001"])).toEqual(["F-001", "F-002", "api"]);
  });

  it("à compléter : sans menace, ou avec une menace sans parade", () => {
    const threats = [
      { surfaces: ["F-001" as const], parades: ["x"] },
      { surfaces: ["F-002" as const, "api" as const], parades: [] },
    ];
    const exposed = ["F-001", "F-002", "F-003", "api"];
    expect(surfacesToComplete(exposed, threats)).toEqual(["F-002", "F-003", "api"]);
  });

  it("exigences sans réponse jusqu'au niveau effectif", () => {
    const requirement = (id: string, niveau: 1 | 2, reponse?: string) => ({
      id,
      chapitre: "api" as const,
      titre: id,
      niveau,
      ...(reponse === undefined ? {} : { reponse }),
    });
    const exigences = [requirement("a", 1), requirement("b", 2), requirement("c", 1, "oui")];
    const ids = (categorie: "technique" | "contact") =>
      unansweredRequirements({ exigences }, [{ categorie }]).map((entry) => entry.id);
    expect(ids("technique")).toEqual(["a"]);
    expect(ids("contact")).toEqual(["a", "b"]);
  });
});
