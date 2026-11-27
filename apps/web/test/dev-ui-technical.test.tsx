import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TechnicalGallery } from "../src/components/dev-ui-technical.tsx";

/** TK-115 lot C : galerie `/dev/ui` des composants du cahier technique. */
describe("galerie du cahier technique", () => {
  it("montre la couche et ses cartes, le tableau comparatif, les environnements et les panneaux", () => {
    render(<TechnicalGallery />);
    const section = screen.getByRole("region", { name: "Cahier technique" });
    expect(within(section).getByRole("region", { name: "Services externes 3" })).toBeVisible();
    expect(within(section).getByRole("table", { name: "Options comparées" })).toBeInTheDocument();
    expect(within(section).getByRole("table", { name: "Environnements" })).toBeInTheDocument();
    expect(within(section).getByRole("region", { name: "Variables et secrets" })).toBeVisible();
    expect(within(section).getByRole("button", { name: /à revoir/ })).toBeVisible();
    const rubric = within(section).getByRole("heading", { level: 3, name: "Texte proposé" });
    expect(rubric.className).toContain("uppercase");
  });
});
