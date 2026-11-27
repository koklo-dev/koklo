// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdTag, IdTitle } from "../src/index.ts";

/** TK-114i (B708) : identifiant long tronqué et titre qui passe dessous sous 112 px de place restante. */
const LONG = "P-consultation-de-la-transparence-sur-les-donnees";

describe("IdTag truncate (A1)", () => {
  it("borné à son conteneur, texte tronqué, identifiant complet au survol", () => {
    render(<IdTag truncate>{LONG}</IdTag>);
    const tag = screen.getByTitle(LONG);
    expect(tag).toHaveAttribute("data-slot", "id-tag");
    expect(tag).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");
    expect(screen.getByText(LONG)).toHaveClass("truncate");
    expect(screen.getByText(LONG).parentElement).toBe(tag);
  });

  it("un enfant qui n'est pas un texte ne donne pas de `title` ; un `title` fourni l'emporte", () => {
    const { container, rerender } = render(
      <IdTag truncate>
        <b>{LONG}</b>
      </IdTag>,
    );
    expect(container.firstElementChild).not.toHaveAttribute("title");
    rerender(
      <IdTag truncate title="Autre">
        {LONG}
      </IdTag>,
    );
    expect(container.firstElementChild).toHaveAttribute("title", "Autre");
  });

  it("sans `truncate`, rendu inchangé : ni `title` ni enveloppe", () => {
    const { container } = render(<IdTag>{LONG}</IdTag>);
    const tag = container.firstElementChild as HTMLElement;
    expect(tag).toHaveClass("whitespace-nowrap");
    expect(tag).not.toHaveClass("overflow-hidden", "max-w-full");
    expect(tag).not.toHaveAttribute("title");
    expect(tag.children).toHaveLength(0);
  });
});

describe("IdTitle (A2)", () => {
  it("identifiant tronqué puis titre, qui passe à la ligne sous 112 px", () => {
    const { container } = render(
      <IdTitle id={LONG} title="Consulter" titleClassName="font-semibold" />,
    );
    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveClass(
      "flex",
      "min-w-0",
      "flex-1",
      "flex-wrap",
      "items-center",
      "gap-x-2",
      "gap-y-0.5",
    );
    expect(screen.getByTitle(LONG)).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");
    const title = screen.getByText("Consulter");
    expect(title).toHaveClass("min-w-0", "flex-1", "basis-28", "font-semibold");
    expect(title).not.toHaveClass("truncate");
    expect(title).not.toHaveAttribute("title");
    expect([...box.children]).toEqual([screen.getByTitle(LONG), title]);
  });

  it("`clipTitle` : titre sur une ligne, complet au survol ; `size` sm sur l'identifiant", () => {
    render(<IdTitle id={LONG} title="Consulter la transparence" size="sm" clipTitle />);
    const title = screen.getByText("Consulter la transparence");
    expect(title).toHaveClass("truncate", "basis-28");
    expect(title).toHaveAttribute("title", "Consulter la transparence");
    expect(screen.getByTitle(LONG)).toHaveClass("text-code-sm", "h-5");
  });
});
