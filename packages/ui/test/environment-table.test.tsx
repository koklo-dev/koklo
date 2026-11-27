// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EnvironmentTable } from "../src/index.ts";

/** TK-115 lot C : tableau des environnements (DESIGN.md §5.26, maquette 14 l.282-288, 673-678). */
const COLUMNS = ["Développement", "Recette", "Production", "Démo"].map((name) => ({
  id: name,
  name,
}));
const ROWS = [
  { label: "Adresse", mono: true, values: ["localhost:3000", "recette", "prod", "demo"] },
  { label: "SMS", values: ["Simulés", "Test", "Réels · fournisseur à trancher", undefined] },
];

const view = () =>
  render(
    <EnvironmentTable
      title="Environnements"
      columns={COLUMNS}
      rows={ROWS}
      action={<button type="button">Modifier</button>}
    />,
  );

describe("EnvironmentTable", () => {
  it("légende avec l'action, tableau nommé de 720 px au moins dans une région focusable", () => {
    view();
    expect(screen.getByRole("button", { name: "Modifier" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Environnements" });
    expect(table.className).toContain("min-w-[720px]");
    const region = screen.getByRole("region", { name: "Tableau : Environnements" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("overflow-auto");
    expect(region).not.toContainElement(screen.getByRole("button", { name: "Modifier" }));
  });

  it("colonnes à pastille de 8 px : neutre, ambre, verte, puis neutre", () => {
    view();
    const heads = within(screen.getByRole("table")).getAllByRole("columnheader");
    expect(heads.map((th) => th.textContent)).toEqual(COLUMNS.map((c) => c.name));
    const dots = heads.map((th) => th.querySelector("[data-slot='env-dot']")?.className);
    expect(dots[0]).toContain("bg-border-strong");
    expect(dots[1]).toContain("bg-status-pending-icon");
    expect(dots[2]).toContain("bg-status-validated-foreground");
    expect(dots[3]).toContain("bg-border-strong");
    for (const dot of dots) expect(dot).toContain("size-2");
  });

  it("lignes à intitulé, adresse en mono, « à trancher » écrit en ambre, valeur absente « — »", () => {
    view();
    expect(screen.getByRole("rowheader", { name: "Adresse" })).toHaveAttribute("scope", "row");
    expect(screen.getByRole("cell", { name: "localhost:3000" }).className).toContain("font-mono");
    const open = screen.getByRole("cell", { name: "Réels · fournisseur à trancher" });
    expect(open.className).toContain("text-status-pending-foreground");
    expect(open.className).toContain("font-semibold");
    expect(screen.getByRole("cell", { name: "Simulés" }).className).not.toContain("font-mono");
    expect(screen.getByRole("cell", { name: "—" })).toBeInTheDocument();
  });
});
