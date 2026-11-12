import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DevUiSpecItemSheet } from "../src/components/dev-ui-spec-item-sheet.tsx";
import { polyfillRadix } from "./support/web-mocks.ts";

/** TK-101 lot B : section « 17. Panneau d'édition » de la galerie (S-dev-ui 1.6), les 4 modes de la maquette 16. */
async function openMode(mode: string) {
  render(<DevUiSpecItemSheet />);
  await userEvent.click(screen.getByRole("radio", { name: mode }));
  await userEvent.click(screen.getByRole("button", { name: "Ouvrir le panneau d'exemple" }));
  return within(await screen.findByRole("dialog"));
}

describe("Galerie : panneau d'édition", () => {
  beforeEach(() => polyfillRadix());

  it("la section porte l'id dev-ui-spec-item-sheet", () => {
    const { container } = render(<DevUiSpecItemSheet />);
    expect(container.querySelector("#dev-ui-spec-item-sheet")).toHaveTextContent(
      "17. Panneau d'édition",
    );
  });

  it("création : encadré d'aide, aucun champ marqué par l'agent", async () => {
    const dialog = await openMode("Création");
    expect(dialog.getByRole("region", { name: "Aide de l'agent" })).toBeVisible();
    expect(dialog.queryByText("proposé par l'agent")).toBeNull();
  });

  it("préremplie : bandeau, « Effacer », champs marqués", async () => {
    const dialog = await openMode("Préremplie par l'agent");
    expect(dialog.getByText(/Préremplie par l'agent\. Vérifiez/)).toBeVisible();
    expect(dialog.getAllByText("proposé par l'agent").length).toBeGreaterThanOrEqual(4);
    expect(dialog.getByRole("textbox", { name: /^Titre/ })).toHaveValue("Liste d'attente");
  });

  it("modification : avertissement du livrable validé et « Supprimer »", async () => {
    const dialog = await openMode("Modification");
    expect(dialog.getByText(/Ce livrable est validé/)).toBeVisible();
    expect(dialog.getByRole("button", { name: "Supprimer" })).toBeVisible();
    expect(dialog.getByRole("button", { name: "Enregistrer les modifications" })).toBeVisible();
  });

  it("erreurs : résumé, « Obligatoire » sous chaque champ vide", async () => {
    const dialog = await openMode("Erreurs");
    expect(dialog.getByText(/3 champs obligatoires sont vides/)).toBeVisible();
    expect(dialog.getAllByText("Obligatoire")).toHaveLength(3);
  });
});
