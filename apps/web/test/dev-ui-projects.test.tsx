import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DevUiProjects } from "../src/components/dev-ui-projects.tsx";

/** TK-93 lot B : section « 15. Projets » de la galerie /dev/ui (DESIGN.md §5.12). */
describe("galerie /dev/ui : section Projets", () => {
  it("région nommée « 15. Projets » avec tuiles, pastilles de phase, liste d'avancement et cartes", () => {
    render(<DevUiProjects />);
    const region = screen.getByRole("region", { name: "15. Projets" });
    expect(
      region.querySelectorAll("[data-slot='project-tile'][data-size='22']").length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      region.querySelectorAll("[data-slot='project-tile'][data-size='36']").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      region.querySelectorAll("[data-slot='project-tile'][data-size='40']").length,
    ).toBeGreaterThanOrEqual(5);
    for (const text of ["Idée · 1/4", "Cadrage · 2/4", "Itérations · 4/4"]) {
      expect(within(region).getAllByText(text).length).toBeGreaterThanOrEqual(1);
    }
    expect(within(region).getAllByRole("status").length).toBeGreaterThanOrEqual(2);
  });

  it("cartes : normale, attention, client, création, échec", () => {
    render(<DevUiProjects />);
    const region = screen.getByRole("region", { name: "15. Projets" });
    expect(
      within(region).getAllByRole("link", { name: /^Portail de réservation.*Cadrage/ }),
    ).toHaveLength(1);
    expect(
      region.querySelectorAll("[data-slot='project-card-next'][data-tone='warning']").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      region.querySelectorAll("[data-slot='project-card-next'][data-tone='neutral']").length,
    ).toBeGreaterThanOrEqual(1);
    expect(within(region).getByText("Aucun client invité")).toBeInTheDocument();
    expect(region.querySelectorAll("[data-slot='project-card-creating']")).toHaveLength(2);
    expect(within(region).getAllByText(/Ce nom est déjà pris/).length).toBeGreaterThanOrEqual(1);
  });
});
