// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FactsPanel, SectionLead } from "../src/index.ts";

/** TK-117 lot C : « Secrets et dépendances » (maquette 15 l.198-199). */
describe("FactsPanel", () => {
  it("panneau nommé par son titre, une ligne par fait, note en pied", () => {
    render(
      <FactsPanel
        title="Secrets et dépendances"
        facts={[{ label: "Rotation", value: "90 jours" }]}
        note="Note"
      />,
    );
    const panel = screen.getByRole("region", { name: "Secrets et dépendances" });
    expect(
      screen.getByRole("heading", { level: 2, name: "Secrets et dépendances" }),
    ).toBeInTheDocument();
    expect(panel).toHaveTextContent("Rotation");
    expect(panel).toHaveTextContent("90 jours");
    expect(panel).toHaveTextContent("Note");
  });

  it("titre de réglage : h2 15/600 et aide muette", () => {
    render(<SectionLead title="Niveau d'exigence" help="La grille." />);
    expect(screen.getByRole("heading", { level: 2 }).className).toContain("text-[15px]");
    expect(screen.getByText("La grille.").className).toContain("text-muted-foreground");
  });

  it("sans fait : le texte vide", () => {
    render(<FactsPanel title="Secrets" facts={[]} emptyText="À préciser" />);
    expect(screen.getByText("À préciser")).toBeInTheDocument();
  });
});
