// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "../scripts/generate-icons.ts";
import {
  DocSectionLegend,
  DocSectionStatus,
  type DocSectionStatusValue,
  docSectionStatusLabel,
} from "../src/index.ts";

/** TK-111 lot C (DESIGN.md §5.22, maquette 13 l.264-271, 764) : `DocSectionStatus` et sa légende. */
const CASES: Array<[DocSectionStatusValue, string]> = [
  ["validee", "Validée"],
  ["a_relire", "À relire"],
  ["brouillon", "Brouillon"],
  ["a_rediger", "À rédiger"],
];

describe("DocSectionStatus", () => {
  it.each(CASES)("%s s'écrit « %s » à côté de l'icône", (status, label) => {
    const { container } = render(<DocSectionStatus status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(docSectionStatusLabel(status)).toBe(label);
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("dans la légende (inline), l'icône Validée reste pleine mais estompée, en 12 px à 400", () => {
    const { container } = render(<DocSectionStatus status="validee" />);
    expect(container.querySelector("svg")?.getAttribute("class")).not.toMatch(/text-primary/);
    expect(container.firstElementChild?.className).toMatch(/font-normal/);
    expect(container.firstElementChild?.className).toMatch(/text-muted-foreground/);
  });

  it("Validée est en `--primary` et plein dans la colonne, les autres sont estompées", async () => {
    const ok = render(<DocSectionStatus status="validee" display="icon" />);
    expect(ok.container.querySelector("[data-slot='doc-section-status']")?.className).not.toMatch(
      /text-muted-foreground/,
    );
    expect(ok.container.querySelector("svg")?.getAttribute("class")).toMatch(/text-primary/);
    await waitFor(() => expect(ok.container.querySelector("path")).not.toBeNull());
    const draft = render(<DocSectionStatus status="brouillon" display="icon" />);
    expect(draft.container.querySelector("[data-slot='doc-section-status']")?.className).toMatch(
      /text-muted-foreground/,
    );
  });

  it("l'icône seule garde son libellé pour les lecteurs d'écran, jamais la seule icône", () => {
    render(<DocSectionStatus status="a_relire" display="icon" />);
    expect(screen.getByText("À relire")).toHaveClass("sr-only");
  });

  it("la pastille du titre est une pastille de 24 px, verte pour Validée seulement", () => {
    const ok = render(<DocSectionStatus status="validee" display="pill" />);
    expect(ok.container.firstElementChild?.className).toMatch(/h-6/);
    expect(ok.container.firstElementChild?.className).toMatch(/bg-status-validated/);
    const todo = render(<DocSectionStatus status="a_rediger" display="pill" />);
    expect(todo.container.firstElementChild?.className).toMatch(/bg-secondary/);
  });

  it("n'emploie aucune couleur en dur", () => {
    const { container } = render(<DocSectionLegend />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
  });
});

describe("DocSectionLegend", () => {
  it("liste les quatre statuts, collée en bas de la colonne", () => {
    render(<DocSectionLegend />);
    const list = screen.getByRole("list", { name: "Légende des statuts" });
    expect(list.textContent).toBe("ValidéeÀ relireBrouillonÀ rédiger");
    expect(list.className).toMatch(/mt-auto/);
  });
});

describe("icône summarize", () => {
  it("figure au registre fermé (« Résumer pour le client »)", () => {
    expect(ICON_NAMES).toContain("summarize");
  });
});
