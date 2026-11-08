import { describe, expect, it } from "vitest";
import { ideaFile, moveAnnouncement, numberedTitle, SAVE_LABEL } from "../src/lib/idea-labels.ts";
import { arrayMoveIds } from "../src/lib/idea-order.ts";
import { canPublishIdea, canWriteIdea } from "../src/lib/roles.ts";
import { isIdeaPath } from "../src/lib/shell-routes.ts";

describe("espace Idée : aides pures", () => {
  it("numérote par position et nomme le fichier par son slug", () => {
    expect(numberedTitle("Périmètre", 5)).toBe("05 · Périmètre");
    expect(ideaFile("perimetre")).toBe("idea/perimetre.md");
  });

  it("annonce le déplacement", () => {
    expect(moveAnnouncement("Périmètre", 4, 11)).toBe("Périmètre déplacée en position 4 sur 11");
  });

  it("indicateurs d'enregistrement (T20)", () => {
    expect(SAVE_LABEL.saving).toBe("Enregistrement…");
    expect(SAVE_LABEL.saved).toBe("Brouillon enregistré");
    expect(SAVE_LABEL.offline).toBe("Hors ligne : modifications gardées localement");
  });

  it("déplace d'un cran, sans sortir des bords", () => {
    expect(arrayMoveIds(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(arrayMoveIds(["a", "b", "c"], "a", -1)).toBeNull();
    expect(arrayMoveIds(["a", "b", "c"], "c", 1)).toBeNull();
    expect(arrayMoveIds(["a", "b"], "x", 1)).toBeNull();
  });

  it("droits d'affichage : le client rédige sans publier, le business lit", () => {
    expect(canWriteIdea("client")).toBe(true);
    expect(canPublishIdea("client")).toBe(false);
    expect(canWriteIdea("business")).toBe(false);
    expect(canWriteIdea("dev")).toBe(true);
    expect(canPublishIdea("designer")).toBe(true);
  });

  it("rail replié seulement sur la route de l'Idée", () => {
    expect(isIdeaPath("/projects/abc/idea")).toBe(true);
    expect(isIdeaPath("/projects/abc/idea/")).toBe(true);
    expect(isIdeaPath("/projects/abc/tickets")).toBe(false);
  });
});
