import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DevUiAgent } from "../src/components/dev-ui-agent.tsx";
import { DevUiArchitecture } from "../src/components/dev-ui-architecture.tsx";
import { DevUiStatuses } from "../src/components/dev-ui-statuses.tsx";

/** TK-111 lot C : galerie /dev/ui, `DocSectionStatus` (S-dev-ui §3) et variante « section » de `ProposedPageCard`. */
describe("Galerie : architecture", () => {
  it("montre les quatre statuts de section en pastille, en icône seule et en légende", () => {
    render(<DevUiStatuses />);
    for (const label of ["Validée", "À relire", "Brouillon", "À rédiger"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(3);
    }
    expect(screen.getByRole("list", { name: "Légende des statuts" })).toBeInTheDocument();
  });

  it("montre l'encadré de section proposée, avec ses deux boutons", () => {
    render(<DevUiAgent />);
    const card = screen.getByRole("group", { name: "Section proposée par l'agent" });
    expect(card).toHaveTextContent("Observabilité");
    expect(screen.getByRole("button", { name: "Ajouter la section" })).toBeInTheDocument();
  });

  it("TK-113 : montre DecisionStatus (trois statuts écrits) et le nœud « à revoir »", () => {
    render(<DevUiArchitecture />);
    for (const label of ["Acceptée", "Proposée", "Remplacée"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("button", { name: "Service À revoir, à revoir" })).toBeInTheDocument();
  });
});
