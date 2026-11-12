import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DevUiSpecCollection } from "../src/components/dev-ui-spec-collection.tsx";

/** TK-102 lot B : section « 18. Collection de la spec » de la galerie (S-dev-ui, maquette 10 l.179-221). */
describe("Galerie : collection de la spec", () => {
  it("la section porte l'id dev-ui-spec-collection et le titre 18", () => {
    const { container } = render(<DevUiSpecCollection />);
    expect(container.querySelector("#dev-ui-spec-collection")).toHaveTextContent(
      "18. Collection de la spec",
    );
  });

  it("montre la liste, la fiche ancrée et ferme la fiche au clic", async () => {
    render(<DevUiSpecCollection />);
    const aside = screen.getByRole("complementary", { name: "Fiche de la fonctionnalité" });
    expect(within(aside).getByRole("heading", { level: 2 })).toBeInTheDocument();
    await userEvent.click(within(aside).getByRole("button", { name: "Fermer la fiche" }));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("présente les statuts Prêt et Génération, les trois pastilles de la barre et une ligne à priorité libellée", () => {
    render(<DevUiSpecCollection />);
    expect(screen.getAllByText("Prêt").length).toBeGreaterThan(0);
    expect(screen.getByText("Génération")).toBeInTheDocument();
    expect(screen.getByText("3 à relire")).toBeInTheDocument();
    expect(screen.getAllByText("Indispensable").length).toBeGreaterThan(0);
    expect(screen.getAllByText("À valider").length).toBeGreaterThan(0);
  });
});
