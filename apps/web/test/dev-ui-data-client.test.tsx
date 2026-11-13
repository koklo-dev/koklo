import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DevUiDataClient } from "../src/components/dev-ui-data-client.tsx";

/** TK-109 lot C : section « 22. Vue client des Données » de la galerie (DESIGN.md §5.20). */
describe("Galerie : vue client des Données", () => {
  it("la section porte l'id dev-ui-data-client et le titre 22", () => {
    const { container } = render(<DevUiDataClient />);
    expect(container.querySelector("#dev-ui-data-client")).toHaveTextContent(
      "22. Vue client des Données",
    );
  });

  it("montre le bandeau « Lecture seule » et la fiche « Ce qu'on enregistre »", () => {
    render(<DevUiDataClient />);
    expect(screen.getByRole("note")).toHaveTextContent("Lecture seule.");
    expect(screen.getByText("Ce qu'on enregistre")).toBeInTheDocument();
  });
});
