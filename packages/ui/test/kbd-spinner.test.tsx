// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Kbd, Spinner } from "../src/index.ts";

describe("Kbd (DESIGN.md §5.5)", () => {
  it("rend un <kbd> mono 11/500 de 18 px, bordure --border, fond --background", () => {
    render(<Kbd>⌘K</Kbd>);
    const kbd = screen.getByText("⌘K");
    expect(kbd.tagName).toBe("KBD");
    for (const c of [
      "h-[18px]",
      "px-[5px]",
      "text-code-sm",
      "font-mono",
      "border",
      "rounded-sm",
      "bg-background",
    ]) {
      expect(kbd).toHaveClass(c);
    }
  });
});

describe("Spinner (DESIGN.md §5.5)", () => {
  it("décoratif : aria-hidden, rotation sous motion-safe, ton primaire par défaut", () => {
    const { container } = render(<Spinner />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveAttribute("data-slot", "spinner");
    expect(root).toHaveClass("motion-safe:animate-spin", "text-primary");
    expect(root.className).not.toMatch(/(^|\s)animate-spin/);
  });

  it.each([16, 18, 20] as const)("taille %i", (size) => {
    const { container } = render(<Spinner size={size} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", String(size));
  });

  it("tone current : text-current", () => {
    const { container } = render(<Spinner tone="current" />);
    expect(container.firstElementChild).toHaveClass("text-current");
  });

  it("refuse au type une taille hors 16, 18 ou 20", () => {
    // @ts-expect-error 24 hors échelle du spinner
    render(<Spinner size={24} />);
  });
});
