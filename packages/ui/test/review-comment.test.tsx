// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewComment } from "../src/index.ts";

/** TK-104 (DESIGN.md §5.17, maquette 10 l.207) : pastille d'initiales, nom et mention, texte brut. */
describe("ReviewComment", () => {
  it("affiche « <nom> · demande de changement » et le texte", () => {
    render(<ReviewComment name="Marie Lefèvre">Déplacer jusqu'à 1 h avant.</ReviewComment>);
    expect(screen.getByText("Marie Lefèvre · demande de changement")).toHaveClass("font-semibold");
    expect(screen.getByText("Déplacer jusqu'à 1 h avant.")).toBeInTheDocument();
  });

  it("déduit les initiales du nom, ou prend celles données ; la pastille est décorative", () => {
    const { container, rerender } = render(<ReviewComment name="Marie Lefèvre">x</ReviewComment>);
    const badge = () => container.querySelector("[aria-hidden='true']");
    expect(badge()).toHaveTextContent("ML");
    expect(badge()).toHaveClass("size-[26px]", "rounded-full");
    rerender(
      <ReviewComment name="Marie" initials="MA">
        x
      </ReviewComment>,
    );
    expect(badge()).toHaveTextContent("MA");
  });

  it("rend le texte comme du texte brut", () => {
    render(<ReviewComment name="Marie">{"<b>gras</b>"}</ReviewComment>);
    expect(screen.getByText("<b>gras</b>")).toBeInTheDocument();
  });
});
