// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonVariants } from "../src/index.ts";

/** TK-138 lot A (DESIGN.md §5.2 et §5.5, catalogue §1.1) : tailles, variantes et props du Button. */
const classes = (cls: string) => cls.split(/\s+/);

describe("Button : tailles", () => {
  it.each([
    ["xs", ["h-7", "px-2.5", "text-caption"]],
    ["sm", ["h-8", "px-3", "text-meta"]],
    ["default", ["h-9", "px-3.5"]],
    ["lg", ["h-10", "px-4"]],
    ["icon", ["size-9"]],
  ] as const)("taille %s : classes de la mesure", (size, expected) => {
    for (const c of expected)
      expect(classes(buttonVariants({ size })), `${size} ${c}`).toContain(c);
  });

  it.each([
    ["sm", "pl-2.5"],
    ["default", "pl-3"],
    ["lg", "pl-3"],
  ] as const)("taille %s avec icône : marge gauche %s", (size, pad) => {
    render(
      <Button size={size} icon="add">
        Ajouter
      </Button>,
    );
    expect(screen.getByRole("button")).toHaveClass(pad);
  });
});

describe("Button : variantes", () => {
  it("dashed : bordure pointillée --border-strong, fond transparent", () => {
    const cls = classes(buttonVariants({ variant: "dashed" }));
    for (const c of ["border", "border-dashed", "border-border-strong", "bg-transparent"]) {
      expect(cls).toContain(c);
    }
  });

  it("inherit : contour currentColor, graisse 600", () => {
    const cls = classes(buttonVariants({ variant: "inherit" }));
    expect(cls).toContain("border-current");
    expect(cls).toContain("font-semibold");
  });

  it("link : souligné, 600, hauteur 28 (h-7 l'emporte sur la taille)", () => {
    const cls = classes(buttonVariants({ variant: "link" }));
    expect(cls).toContain("underline");
    expect(cls).toContain("font-semibold");
    expect(cls).toContain("h-7");
    expect(cls).not.toContain("h-9");
  });

  it("text : lien texte de 26 px, 13/500, marges 8, couleur --text (maquette 06)", () => {
    const cls = classes(buttonVariants({ variant: "text" }));
    expect(cls).toContain("h-[26px]");
    expect(cls).toContain("px-2");
    expect(cls).toContain("text-foreground");
    expect(cls).toContain("underline");
    expect(cls).not.toContain("font-semibold");
  });

  it("link : marges 10 et texte 13 l'emportent sur la taille ; ghost default marges 12", () => {
    const link = classes(buttonVariants({ variant: "link" }));
    expect(link).toContain("px-2.5");
    expect(link).not.toContain("px-3.5");
    expect(link).toContain("text-meta");
    const ghost = classes(buttonVariants({ variant: "ghost" }));
    expect(ghost).toContain("px-3");
    expect(ghost).not.toContain("px-3.5");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Button : props", () => {
  it("icon rend l'Icon décorative (16 en xs et sm, 20 sinon)", () => {
    const { container, rerender } = render(
      <Button size="sm" icon="add">
        A
      </Button>,
    );
    const svg = () => container.querySelector("svg");
    expect(svg()).toHaveAttribute("width", "16");
    expect(svg()).toHaveAttribute("aria-hidden", "true");
    rerender(
      <Button size="xs" icon="add">
        A
      </Button>,
    );
    expect(svg()).toHaveAttribute("width", "16");
    rerender(<Button icon="add">A</Button>);
    expect(svg()).toHaveAttribute("width", "20");
    rerender(
      <Button size="lg" icon="add">
        A
      </Button>,
    );
    expect(svg()).toHaveAttribute("width", "20");
  });

  it("shortcut rend un kbd en suffixe", () => {
    render(<Button shortcut="⌘K">Rechercher</Button>);
    const kbd = screen.getByRole("button").querySelector("kbd");
    expect(kbd).toHaveTextContent("⌘K");
  });

  it("loading : aria-busy, spinner, clic ignoré, non pointillé, opacité .82", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Envoi
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("[data-slot='spinner']")).not.toBeNull();
    expect(button.className).toContain("opacity-[.82]");
    expect(classes(button.className)).not.toContain("border-dashed");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading : le bouton reste focalisable et sans aria-busy hors chargement", () => {
    const { rerender } = render(<Button>Envoi</Button>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
    rerender(<Button loading>Envoi</Button>);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("pressed : aria-pressed et halo --secondary", () => {
    const { rerender } = render(<Button pressed>Filtre</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.className).toContain("shadow-[0_0_0_3px_var(--secondary)]");
    rerender(<Button pressed={false}>Filtre</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("sans pressed, pas d'aria-pressed", () => {
    render(<Button>Filtre</Button>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });

  it("fullWidth : w-full", () => {
    render(<Button fullWidth>Large</Button>);
    expect(screen.getByRole("button")).toHaveClass("w-full");
  });

  it("Entrée et Espace activent le bouton", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Valider</Button>);
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
