import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DevUiIdea } from "../src/components/dev-ui-idea.tsx";

/** TK-89 : section « Espace Idée » de la galerie /dev/ui (DESIGN.md §5.8). */
describe("galerie /dev/ui : section Espace Idée", () => {
  it("région nommée, liste réordonnable, légende, avatars et document", () => {
    render(<DevUiIdea />);
    const region = screen.getByRole("region", { name: "12. Espace Idée" });
    expect(within(region).getAllByRole("button", { name: /^Déplacer / })).toHaveLength(4);
    expect(within(region).getByRole("list", { name: "Légende des états" })).toBeVisible();
    expect(within(region).getByRole("list", { name: "Présents dans le dossier" })).toBeVisible();
    expect(within(region).getByText("idea/perimetre.md")).toBeVisible();
    expect(within(region).getByText(/taper « \/ » pour insérer un bloc/)).toBeVisible();
  });

  it("TK-91 : jauge de maturité et ligne Synthèse", () => {
    render(<DevUiIdea />);
    const region = screen.getByRole("region", { name: "12. Espace Idée" });
    const meters = within(region).getAllByRole("meter", { name: "Maturité du dossier" });
    expect(meters.length).toBeGreaterThanOrEqual(2);
    expect(within(region).getByText("1 page stable sur 10")).toBeVisible();
    expect(within(region).getAllByRole("link", { name: /Synthèse/ })).toHaveLength(3);
  });
});
