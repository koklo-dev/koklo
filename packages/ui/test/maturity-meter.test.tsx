// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MaturityMeter, SynthesisNavItem } from "../src/index.ts";

/** TK-91 : jauge de maturité et ligne Synthèse (DESIGN.md §5.10, maquette 06 l.52 et l.74). */
describe("MaturityMeter", () => {
  it("expose un role meter nommé avec ses bornes et sa valeur", () => {
    render(<MaturityMeter stable={3} total={10} />);
    const meter = screen.getByRole("meter", { name: "Maturité du dossier" });
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "10");
    expect(meter).toHaveAttribute("aria-valuenow", "3");
  });

  it("dessine un cran par page, les atteints en primaire, les autres en bordure forte", () => {
    render(<MaturityMeter stable={3} total={10} />);
    const meter = screen.getByRole("meter");
    expect(meter.children).toHaveLength(10);
    const reached = [...meter.children].filter((c) => c.getAttribute("data-reached") === "true");
    expect(reached).toHaveLength(3);
    expect(reached[0]).toHaveClass("bg-primary", "h-1.5", "w-2.5", "rounded-[2px]");
    expect(meter.children[9]).toHaveClass("bg-border-strong");
  });

  it("laisse les crans passer à la ligne", () => {
    render(<MaturityMeter stable={0} total={12} />);
    expect(screen.getByRole("meter")).toHaveClass("flex-wrap", "gap-[3px]");
  });

  it("accompagne la jauge d'un texte, au pluriel", () => {
    render(<MaturityMeter stable={3} total={10} />);
    expect(screen.getByText("3 pages stables sur 10")).toBeInTheDocument();
  });

  it("met « page stable » au singulier pour 1 (et 0)", () => {
    const { rerender } = render(<MaturityMeter stable={1} total={10} />);
    expect(screen.getByText("1 page stable sur 10")).toBeInTheDocument();
    rerender(<MaturityMeter stable={0} total={10} />);
    expect(screen.getByText("0 page stable sur 10")).toBeInTheDocument();
  });

  it("borne la valeur au nombre de pages", () => {
    render(<MaturityMeter stable={14} total={10} />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "10");
  });
});

describe("SynthesisNavItem", () => {
  it("est un lien « Synthèse » avec l'étiquette « générée », sans poignée ni menu", () => {
    render(<SynthesisNavItem href="/p?page=synthese" />);
    const link = screen.getByRole("link", { name: /Synthèse/ });
    expect(link).toHaveAttribute("href", "/p?page=synthese");
    expect(link).toHaveTextContent("générée");
    expect(link).toHaveClass("min-h-9");
    expect(link).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("la page courante est marquée aria-current et prend --secondary", () => {
    render(<SynthesisNavItem href="/p" current />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass("bg-secondary", "font-semibold");
  });

  it("reprend le gabarit de l'étiquette « requise » et peut s'en passer", () => {
    const { rerender } = render(<SynthesisNavItem href="/p" />);
    expect(screen.getByText("générée")).toHaveClass("rounded-[4px]", "border", "text-[10px]");
    rerender(<SynthesisNavItem href="/p" tag={null} />);
    expect(screen.queryByText("générée")).toBeNull();
  });
});
