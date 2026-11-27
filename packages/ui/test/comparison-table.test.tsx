// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComparisonTable } from "../src/index.ts";

/** TK-115 lot C : tableau comparatif des options (DESIGN.md §5.26, maquette 14 l.202-207, 576-577). */
const OPTIONS = ["Brevo", "Twilio"];
const CRITERIA = [
  { label: "Prix par SMS", values: ["≈ 0,045 €", "≈ 0,07 €"], estimate: true },
  { label: "Données en UE", values: ["Oui", "Non par défaut"] },
];

describe("ComparisonTable", () => {
  it("tableau à en-têtes de colonnes et de lignes, dans une région défilante focusable", () => {
    render(<ComparisonTable options={OPTIONS} criteria={CRITERIA} />);
    const table = screen.getByRole("table", { name: "Options comparées" });
    const columns = within(table).getAllByRole("columnheader");
    expect(columns.map((th) => th.textContent)).toEqual(["Critère", "Brevo", "Twilio"]);
    for (const th of columns) expect(th).toHaveAttribute("scope", "col");
    const rows = within(table).getAllByRole("rowheader");
    expect(rows.map((th) => th.textContent)).toEqual(["Prix par SMS", "Données en UE"]);
    for (const th of rows) expect(th).toHaveAttribute("scope", "row");
    const region = screen.getByRole("region", { name: "Tableau comparatif des options" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("overflow-auto");
    expect(region.className).toContain("rounded-[10px]");
  });

  it("colonne mise en avant : fond secondaire, étiquette sous le nom, valeurs en 600", () => {
    render(
      <ComparisonTable
        options={OPTIONS}
        criteria={CRITERIA}
        highlight={{ option: "Brevo", tag: "Recommandé" }}
      />,
    );
    const head = screen.getByRole("columnheader", { name: /Brevo/ });
    expect(head).toHaveTextContent("Recommandé");
    expect(head.className).toContain("bg-secondary");
    expect(screen.getByText("Recommandé").className).toContain("text-primary");
    const cell = screen.getByRole("cell", { name: "Oui" });
    expect(cell.className).toContain("bg-secondary");
    expect(cell.className).toContain("font-semibold");
    // Maquette 14 l.203 et l.574 : le texte reste en couleur de texte, en-têtes centrés verticalement.
    expect(cell.className).not.toContain("text-secondary-foreground");
    expect(head.className).not.toContain("align-bottom");
    expect(screen.getByRole("cell", { name: "Non par défaut" }).className).not.toContain(
      "bg-secondary",
    );
    expect(screen.getByRole("columnheader", { name: "Twilio" }).className).not.toContain(
      "bg-secondary",
    );
  });

  it("estimations : la note « ≈ » seulement quand une valeur est estimée", () => {
    const { rerender } = render(<ComparisonTable options={OPTIONS} criteria={CRITERIA} />);
    expect(screen.getByText("≈ : estimations à vérifier")).toBeInTheDocument();
    rerender(<ComparisonTable options={OPTIONS} criteria={CRITERIA.slice(1)} />);
    expect(screen.queryByText("≈ : estimations à vérifier")).toBeNull();
  });

  it("une valeur absente s'écrit « — »", () => {
    render(<ComparisonTable options={OPTIONS} criteria={[{ label: "Coût", values: ["0 €"] }]} />);
    expect(screen.getByRole("cell", { name: "—" })).toBeInTheDocument();
  });
});
