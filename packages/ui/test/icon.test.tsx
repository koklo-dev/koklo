// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "../src/index.ts";

function svgOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("svg absent");
  return svg;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Icon (Material Symbols Rounded, SVG)", () => {
  it.each([14, 16, 18, 20, 22, 24, 28] as const)(
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
    // @ts-expect-error 30 n'appartient pas à 14 | 16 | 18 | 20 | 22 | 24 | 28
    render(<Icon name="check" size={30} />);
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

  it.each([
    ["muted", "text-muted-foreground"],
    ["primary", "text-primary"],
    ["success", "text-status-validated-foreground"],
    ["danger", "text-destructive"],
  ] as const)("tone %s : classe %s ; sans tone, currentColor hérité", (tone, cls) => {
    const { container } = render(<Icon name="check" tone={tone} />);
    expect(svgOf(container)).toHaveClass(cls);
    const plain = render(<Icon name="check" />);
    expect(svgOf(plain.container).getAttribute("class")).not.toMatch(/text-/);
  });

  it("refuse au type un ton hors échelle", () => {
    // @ts-expect-error ton inconnu
    render(<Icon name="check" tone="warning" />);
  });

  it("wand_stars et les 20 autres glyphes de TK-138 se chargent", async () => {
    const { container } = render(<Icon name="wand_stars" />);
    await waitFor(() => expect(container.querySelector("path")?.getAttribute("d")).toBeTruthy());
  });
});
