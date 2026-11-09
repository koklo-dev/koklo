import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DevUiOverview } from "../src/components/dev-ui-overview.tsx";

/** TK-92 : section « Vue d'ensemble » de la galerie /dev/ui (DESIGN.md §5.11). */
describe("galerie /dev/ui : section Vue d'ensemble", () => {
  it("région nommée avec prochaine étape, livrables, statuts, activité et personnes", () => {
    render(<DevUiOverview />);
    const region = screen.getByRole("region", { name: "14. Vue d'ensemble" });
    expect(within(region).getAllByRole("note", { name: "Prochaine étape" })).toHaveLength(3);
    expect(within(region).getByRole("button", { name: "Relancer Marie" })).toBeVisible();
    expect(
      within(region).getAllByRole("link", {
        name: /^Cahier fonctionnel\s*(À valider|À revoir|Validé)/,
      }),
    ).toHaveLength(3);
    expect(within(region).getByText("Bientôt disponible")).toBeVisible();
    expect(within(region).getAllByText("À revoir").length).toBeGreaterThanOrEqual(1);
    expect(within(region).getByText("En revue")).toBeVisible();
    expect(
      within(region).getByRole("list", { name: "Activité de la démonstration" }),
    ).toBeVisible();
    expect(within(region).getByText("Marie Lefèvre")).toBeVisible();
  });
});
