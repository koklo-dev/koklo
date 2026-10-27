// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "../src/index.ts";

function svgOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("svg absent");
  return svg;
}

describe("Icon (Material Symbols Rounded, SVG)", () => {
  it.each([16, 18, 20, 22, 28] as const)(
    "taille %i : width, height et viewBox du jeu 960",
    (size) => {
      const { container } = render(<Icon name="check" size={size} />);
      const svg = svgOf(container);
      expect(svg).toHaveAttribute("width", String(size));
      expect(svg).toHaveAttribute("height", String(size));
      expect(svg).toHaveAttribute("viewBox", "0 -960 960 960");
    },
  );

  it("taille par défaut 20", () => {
    const { container } = render(<Icon name="check" />);
    expect(svgOf(container)).toHaveAttribute("width", "20");
  });

  it("refuse au type une taille hors échelle ou un nom inconnu", () => {
    // @ts-expect-error 24 n'appartient pas à 16 | 18 | 20 | 22 | 28
    render(<Icon name="check" size={24} />);
    // @ts-expect-error nom hors registre
    render(<Icon name="not_an_icon" />);
  });

  it("décoratif par défaut : aria-hidden et non focalisable", () => {
    const { container } = render(<Icon name="check" />);
    const svg = svgOf(container);
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("fill", "currentColor");
  });

  it("avec aria-label : role img, nom accessible, sans aria-hidden", () => {
    render(<Icon name="check" aria-label="Validé" />);
    const img = screen.getByRole("img", { name: "Validé" });
    expect(img).not.toHaveAttribute("aria-hidden", "true");
  });

  it("fill 0 (défaut) et fill 1 rendent deux tracés différents", async () => {
    const outline = render(<Icon name="check_circle" />);
    const filled = render(<Icon name="check_circle" fill />);
    const d = (c: HTMLElement) => c.querySelector("path")?.getAttribute("d") ?? "";
    await waitFor(() => {
      expect(d(outline.container)).not.toBe("");
      expect(d(filled.container)).not.toBe("");
    });
    expect(d(filled.container)).not.toBe(d(outline.container));
  });
});
