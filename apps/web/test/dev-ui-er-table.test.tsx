import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DevUiErTable } from "../src/components/dev-ui-er-table.tsx";

/** TK-107 lot C : section « 20. Modèle de données » de la galerie (DESIGN.md §5.18). */
describe("Galerie : modèle de données", () => {
  it("la section porte l'id dev-ui-er-table et le titre 20", () => {
    const { container } = render(<DevUiErTable />);
    expect(container.querySelector("#dev-ui-er-table")).toHaveTextContent("20. Modèle de données");
  });

  it("montre la carte dans ses trois états, pastilles texte comprises", () => {
    render(<DevUiErTable />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("À relire")).toBeInTheDocument();
    expect(screen.getByText("Rejetée")).toBeInTheDocument();
  });
});
