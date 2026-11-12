// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ValidationBanner } from "../src/index.ts";

/** TK-104 (DESIGN.md §5.17, maquette 10 l.171-177) : bandeau `role=note`, deux tons, progression à droite. */
describe("ValidationBanner", () => {
  it("est une note avec le titre en 600, la suite du texte et la progression", () => {
    render(
      <ValidationBanner title="Votre validation est attendue." progress="Fonctionnalités 12/248">
        Relisez chaque onglet.
      </ValidationBanner>,
    );
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Votre validation est attendue. Relisez chaque onglet.");
    expect(screen.getByText("Votre validation est attendue.").tagName).toBe("STRONG");
    expect(screen.getByText("Fonctionnalités 12/248")).toHaveClass("font-semibold");
    expect(note.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("warning par défaut, jetons d'alerte ambre ; neutral : jetons neutres", () => {
    const { rerender } = render(<ValidationBanner title="a" />);
    expect(screen.getByRole("note")).toHaveAttribute("data-tone", "warning");
    expect(screen.getByRole("note").className).toContain("bg-alert-warning");
    rerender(<ValidationBanner tone="neutral" title="a" />);
    expect(screen.getByRole("note")).toHaveAttribute("data-tone", "neutral");
    expect(screen.getByRole("note").className).toContain("bg-alert-neutral");
  });

  it("n'emploie aucune couleur en dur", () => {
    render(<ValidationBanner title="a" progress="b" />);
    expect(screen.getByRole("note").outerHTML).not.toMatch(/#[0-9a-f]{3,6}|style=/i);
  });
});
