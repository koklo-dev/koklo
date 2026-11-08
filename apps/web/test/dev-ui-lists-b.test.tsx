import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DevUiListsB } from "../src/components/dev-ui-lists-b.tsx";

/** TK-140 lot B : section « Listes · B » de la galerie /dev/ui (fiche S-dev-ui). */
describe("galerie /dev/ui : section Listes · B", () => {
  it("région nommée, panneaux de lignes et en-têtes présents", () => {
    render(<DevUiListsB />);
    const region = screen.getByRole("region", { name: "Listes · B" });
    expect(within(region).getByRole("region", { name: "Fonctionnalités à relire" })).toBeVisible();
    expect(within(region).getByRole("link", { name: "Tout voir" })).toBeVisible();
    expect(within(region).getByRole("navigation", { name: "Fil d'Ariane" })).toBeVisible();
    expect(within(region).getByRole("navigation", { name: "Emplacement" })).toBeVisible();
    expect(within(region).getAllByText("Cadrage · 2 sur 4").length).toBeGreaterThan(0);
  });

  it("ListRow as=div : contenu de ligne dans l'li d'un hôte, sans second li", () => {
    render(<DevUiListsB />);
    const host = screen.getByTestId("list-row-div-host");
    expect(host.tagName).toBe("LI");
    const row = host.querySelector("[data-slot='list-row']");
    expect(row?.tagName).toBe("DIV");
    expect(host.querySelectorAll("li")).toHaveLength(0);
  });

  it("choisir une ligne déplace aria-current", async () => {
    render(<DevUiListsB />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Réserver un créneau/ }));
    expect(screen.getByRole("button", { name: /Réserver un créneau/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: /Annuler une réservation/ })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
