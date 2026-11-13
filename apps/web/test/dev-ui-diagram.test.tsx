import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DevUiDiagram } from "../src/components/dev-ui-diagram.tsx";

/** TK-108 lot A : section « 21. Diagramme » de la galerie (DESIGN.md §5.19). */
describe("Galerie : diagramme", () => {
  it("la section porte l'id dev-ui-diagram et le titre 21", () => {
    const { container } = render(<DevUiDiagram />);
    expect(container.querySelector("#dev-ui-diagram")).toHaveTextContent("21. Diagramme");
  });

  it("montre le lecteur avec ses tables, ses états, sa barre de zoom et son statut", () => {
    render(<DevUiDiagram />);
    expect(screen.getAllByRole("button", { name: /^Table / }).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("À relire")).toBeInTheDocument();
    expect(screen.getByText("Rejetée")).toBeInTheDocument();
    expect(screen.getAllByRole("toolbar", { name: "Zoom du diagramme" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(/Zoom \d+ %/);
  });

  it("la sélection d'une table est interactive", async () => {
    render(<DevUiDiagram />);
    const card = screen.getAllByRole("button", { name: /^Table Client,/ })[0] as HTMLElement;
    expect(card).toHaveAttribute("aria-pressed", "false");
    await userEvent.setup().click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /^Table Réservation,/ })[0]).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
