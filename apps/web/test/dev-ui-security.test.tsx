import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SecurityGallery } from "../src/components/dev-ui-security.tsx";

/** TK-117 lot C : galerie `/dev/ui` des composants de la Sécurité. */
describe("galerie de la sécurité", () => {
  it("montre menaces, parades, données, droits, couverture, résumé et question", () => {
    render(<SecurityGallery />);
    const section = screen.getByRole("region", { name: "Sécurité" });
    const inside = within(section);
    expect(
      inside.getByRole("button", { name: /SEC-T08 .* Gravité Élevée À traiter/ }),
    ).toBeVisible();
    expect(inside.getByRole("table", { name: "Données sensibles" })).toBeInTheDocument();
    expect(inside.getByRole("table", { name: "Matrice des droits" })).toBeInTheDocument();
    expect(inside.getByRole("table", { name: "Couverture par chapitre" })).toBeInTheDocument();
    expect(inside.getByRole("region", { name: "Secrets et dépendances" })).toBeInTheDocument();
    expect(inside.getByRole("article", { name: "En cas d'incident" })).toBeInTheDocument();
    expect(
      inside.getByRole("region", { name: "Ce que nous attendons de vous" }),
    ).toBeInTheDocument();
    expect(inside.getByRole("textbox", { name: "Votre question à l'équipe" })).toBeInTheDocument();
    expect(inside.getByRole("button", { name: "Proposer une parade" })).toBeVisible();
    const notes = inside.getAllByRole("note").map((note) => note.textContent);
    expect(notes).toHaveLength(2);
    expect(notes.join(" ")).toContain("Hébergement");
  });
});
