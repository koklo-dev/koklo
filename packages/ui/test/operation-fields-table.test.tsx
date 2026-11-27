// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationFieldsTable } from "../src/index.ts";

/** TK-116 lot B : tables Entrée, Sortie, Erreurs d'une opération (DESIGN.md §5.27, maquette 14 l.243-246). */
const table = () =>
  render(
    <OperationFieldsTable
      title="Entrée"
      columns={["Champ", "Type", "Contrainte"]}
      rows={[
        ["serviceId", "uuid", "Service actif"],
        ["nom", "texte(100)", "Obligatoire"],
      ]}
    />,
  );

describe("OperationFieldsTable", () => {
  it("titre h3, table nommée, en-têtes de colonne et lignes dans l'ordre", () => {
    table();
    expect(screen.getByRole("heading", { level: 3, name: "Entrée" })).toBeVisible();
    const grid = screen.getByRole("table", { name: "Entrée" });
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Champ", "Type", "Contrainte"]);
    expect(within(grid).getAllByRole("row")).toHaveLength(3);
    const [name, type, text] = within(
      within(grid).getAllByRole("row")[1] as HTMLElement,
    ).getAllByRole("cell");
    expect(name?.className).toContain("font-mono");
    expect(type?.className).toContain("text-muted-foreground");
    expect(text?.className).not.toContain("font-mono");
  });

  it("défilement interne focusable et nommé", () => {
    table();
    const region = screen.getByRole("region", { name: "Tableau Entrée" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("overflow-auto");
  });
});
