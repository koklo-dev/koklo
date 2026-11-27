// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecRowsPanel } from "../src/index.ts";

/** TK-115 lot C : panneaux « Variables et secrets » et « Intégrations externes » (maquette 14 l.289-297). */
describe("SpecRowsPanel", () => {
  it("section titrée, note, lignes nom, usage et pastille", () => {
    render(
      <SpecRowsPanel
        icon="key"
        title="Variables et secrets"
        note="Noms seulement : aucune valeur dans la spec"
        mono
        rows={[
          {
            name: "DATABASE_URL",
            usage: "Connexion à la base",
            pill: { label: "Coffre de l'hébergeur", tone: "outline" },
          },
        ]}
      />,
    );
    const section = screen.getByRole("region", { name: "Variables et secrets" });
    expect(within(section).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Variables et secrets",
    );
    expect(section.className).toContain("rounded-xl");
    expect(within(section).getByText("Noms seulement : aucune valeur dans la spec")).toBeVisible();
    expect(within(section).getByRole("cell", { name: "DATABASE_URL" }).className).toContain(
      "font-mono",
    );
    const pill = within(section).getByText("Coffre de l'hébergeur");
    expect(pill).toHaveAttribute("data-tone", "outline");
    // Maquette 14 l.677-678 : 12/500, marges 10, hauteur 22.
    expect(pill).toHaveAttribute("data-size", "md");
    expect(pill.className).toContain("h-[22px]");
    expect(pill.className).toContain("px-2.5");
    expect(pill.className).toContain("text-caption");
    expect(within(section).getByRole("table", { name: "Variables et secrets" })).toBeVisible();
  });

  it("sans mono : nom en 500 ; liste vide : la phrase, sans tableau", () => {
    const { rerender } = render(
      <SpecRowsPanel
        icon="cable"
        title="Intégrations externes"
        rows={[{ name: "GitHub", usage: "Dépôt", pill: { label: "Connecté", tone: "success" } }]}
      />,
    );
    const cell = screen.getByRole("cell", { name: "GitHub" });
    expect(cell.className).toContain("font-medium");
    expect(cell.className).not.toContain("font-mono");
    rerender(
      <SpecRowsPanel icon="cable" title="Intégrations externes" rows={[]} emptyText="Aucune." />,
    );
    expect(screen.getByText("Aucune.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
