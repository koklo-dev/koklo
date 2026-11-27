// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataClassificationTable } from "../src/index.ts";

/** TK-117 lot C : tableau des données sensibles (maquette 15 l.161-166, 526-540). */
const ROWS = [
  {
    id: "clients.telephone",
    name: "Téléphone",
    field: "clients.telephone",
    category: "contact" as const,
    retention: "3 ans",
    access: "Accueil",
    protection: "Chiffré",
    pending: false,
  },
  {
    id: "reservations.note",
    name: "Note",
    field: "reservations.note",
    category: "sensitive" as const,
    retention: "À décider",
    access: "Coiffeuse",
    protection: "—",
    pending: true,
  },
  {
    id: "journaux.ip",
    name: "Champ non classé",
    field: "journaux.ip",
    retention: "À décider",
    access: "—",
    protection: "—",
    pending: true,
  },
];

describe("DataClassificationTable", () => {
  it("tableau nommé de 980 au moins dans une région focusable, en-têtes de colonne", () => {
    render(<DataClassificationTable rows={ROWS} />);
    const table = screen.getByRole("table", { name: "Données sensibles" });
    expect(table.className).toContain("min-w-[980px]");
    const region = screen.getByRole("region", { name: "Tableau : Données sensibles" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("relative");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual([
      "Donnée",
      "Champ",
      "Catégorie",
      "Conservation",
      "Qui y accède",
      "Protection",
      "Actions",
    ]);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("champ coupé aux espaces, jamais au milieu d'un mot (l.164)", () => {
    render(<DataClassificationTable rows={ROWS} />);
    const cell = screen.getByRole("cell", { name: "journaux.ip" });
    expect(cell).toHaveClass("break-words", "font-mono");
    expect(cell).not.toHaveClass("break-all");
  });

  it("catégories en pastilles ; ligne à décider ambre avec « Décider », sinon « Modifier »", async () => {
    const act = vi.fn();
    render(<DataClassificationTable rows={ROWS} onAction={act} />);
    const tone = (label: string) =>
      screen.getByText(label).closest("[data-slot='pill']")?.getAttribute("data-tone");
    expect(tone("Contact")).toBe("soft");
    expect(tone("Santé ou sensible")).toBe("warning");
    expect(tone("À classer")).toBe("outline");
    const row = screen.getByRole("row", { name: /Note/ });
    expect(row.className).toContain("bg-status-pending");
    expect(row).toHaveAttribute("data-spec-id", "reservations.note");
    await userEvent
      .setup()
      .click(within(row).getByRole("button", { name: "Décider : reservations.note" }));
    expect(act).toHaveBeenCalledWith("reservations.note");
    expect(screen.getByRole("button", { name: "Modifier : clients.telephone" })).toHaveTextContent(
      "Modifier",
    );
  });
});
