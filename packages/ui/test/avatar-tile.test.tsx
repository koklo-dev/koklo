// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, AvatarFallback, IconTile } from "../src/index.ts";

const box = (size: number) => (size === 56 ? "size-14" : `size-${size / 4}`);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Avatar (DESIGN.md §5.5)", () => {
  it("défaut : 36 rond, ton muted", () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>YK</AvatarFallback>
      </Avatar>,
    );
    expect(container.firstElementChild).toHaveClass("size-9", "rounded-full");
    expect(screen.getByText("YK")).toHaveClass("bg-muted", "text-muted-foreground");
  });

  it.each([24, 28, 32, 36, 40, 56] as const)("taille %i", (size) => {
    const { container } = render(
      <Avatar size={size}>
        <AvatarFallback>YK</AvatarFallback>
      </Avatar>,
    );
    expect(container.firstElementChild).toHaveClass(box(size));
  });

  it.each([
    [24, "text-[10px]"],
    [32, "text-caption"],
    [36, "text-body"],
    [56, "text-[length:var(--text-settings-title-size)]"],
  ] as const)("initiales taille %i : %s, gras", (size, cls) => {
    render(
      <Avatar size={size}>
        <AvatarFallback>YK</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("YK")).toHaveClass(cls, size === 24 ? "font-semibold" : "font-bold");
  });

  it.each([
    [24, "rounded-md"],
    [28, "rounded-lg"],
    [32, "rounded-lg"],
    [36, "rounded-card"],
    [40, "rounded-card"],
    [56, "rounded-dialog"],
  ] as const)("forme tile taille %i : %s", (size, radius) => {
    const { container } = render(
      <Avatar size={size} shape="tile">
        <AvatarFallback>YK</AvatarFallback>
      </Avatar>,
    );
    expect(container.firstElementChild).toHaveClass(radius);
    expect(container.firstElementChild).not.toHaveClass("rounded-full");
  });

  it.each([
    ["muted", "bg-muted"],
    ["soft", "bg-secondary"],
    ["warning", "bg-status-pending"],
    ["agent", "bg-primary"],
  ] as const)("ton %s", (tone, cls) => {
    render(
      <Avatar tone={tone}>
        <AvatarFallback>YK</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("YK")).toHaveClass(cls);
  });

  it("aucune taille arbitraire text-[", () => {
    render(
      <Avatar>
        <AvatarFallback>YK</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("YK").className).not.toMatch(/text-\[/);
  });
});

describe("IconTile", () => {
  it.each([
    [28, "size-7", "rounded-lg", "18"],
    [32, "size-8", "rounded-lg", "18"],
    [36, "size-9", "rounded-card", "20"],
    [40, "size-10", "rounded-card", "20"],
    [48, "size-12", "rounded-xl", "28"],
  ] as const)("taille %i : boîte, rayon et icône", (size, boxCls, radius, icon) => {
    const { container } = render(<IconTile icon="key" size={size} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass(boxCls, radius);
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("svg")).toHaveAttribute("width", icon);
  });

  it.each([
    ["soft", "bg-secondary"],
    ["primary", "bg-primary"],
    ["success", "bg-status-validated"],
    ["warning", "bg-status-pending"],
  ] as const)("ton %s", (tone, cls) => {
    const { container } = render(<IconTile icon="key" tone={tone} />);
    expect(container.firstElementChild).toHaveClass(cls);
  });
});
