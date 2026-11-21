// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DevUiArchitecture } from "../src/components/dev-ui-architecture.tsx";

/** TK-112 lot B : galerie /dev/ui, section 23 (S-dev-ui) : ArchNodeCard, DiagramViewer en couches, SequenceDiagram. */
describe("Galerie : schéma d'architecture", () => {
  it("la section porte l'id dev-ui-architecture et le titre 23", () => {
    const { container } = render(<DevUiArchitecture />);
    expect(container.querySelector("#dev-ui-architecture")).toHaveTextContent(
      "23. Schéma d'architecture",
    );
  });

  it("montre une forme par type avec son type écrit, puis sélectionné, à relire, autre zone et compact", () => {
    render(<DevUiArchitecture />);
    for (const label of [
      "Acteur",
      "Application",
      "Service",
      "Stockage",
      "File de tâches",
      "Externe",
    ]) {
      expect(
        screen.getAllByRole("button", { name: new RegExp(`^${label} `) }).length,
      ).toBeGreaterThan(0);
    }
    expect(screen.getByRole("button", { name: "Service Sélectionné" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Application À relire, à relire" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /autre zone/ }).length).toBeGreaterThan(0);
  });

  it("montre le lecteur en couches avec sa zone voisine estompée, sans état pressé", () => {
    render(<DevUiArchitecture />);
    const viewer = screen.getByRole("region", { name: "Schéma d'architecture, démonstration" });
    expect(within(viewer).getByText("Données et services externes")).toBeInTheDocument();
    expect(
      within(viewer).getByRole("button", { name: "Service Communication, autre zone" }),
    ).not.toHaveAttribute("aria-pressed");
  });

  it("montre le diagramme de séquence avec son alternative textuelle", () => {
    render(<DevUiArchitecture />);
    expect(
      screen.getByRole("img", {
        name: "Diagramme de séquence Réserver un rendez-vous, 6 messages",
      }),
    ).toBeVisible();
    expect(screen.getByText("Lire les messages")).toBeInTheDocument();
  });
});
