// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "../src/index.ts";

/** TK-139 lot A, cas 1 et 2 (fiche §3, DESIGN.md §5.6) : variantes de `Card` et en-tête à action. */
const VARIANTS = [
  ["panel", ["rounded-xl", "border", "bg-background", "px-[18px]", "py-4"]],
  ["inset", ["rounded-card", "border", "bg-surface", "px-3.5", "py-3"]],
  ["interactive", ["rounded-xl", "border", "bg-background"]],
  ["proposal", ["rounded-xl", "border-dashed", "border-primary", "bg-diff-bg"]],
  ["dashed", ["rounded-xl", "border-dashed", "border-border-strong"]],
  ["warning", ["rounded-xl", "border-alert-warning-border"]],
] as const;

describe("Card", () => {
  it("rend panel par défaut", () => {
    const { container } = render(<Card />);
    const el = container.firstElementChild;
    expect(el).toHaveAttribute("data-slot", "card");
    expect(el).toHaveAttribute("data-variant", "panel");
    expect(el).toHaveClass("rounded-xl", "px-[18px]", "py-4");
  });

  it.each(VARIANTS)("variante %s : sa bordure, son fond, son rayon", (variant, classes) => {
    const { container } = render(<Card variant={variant} />);
    const el = container.firstElementChild;
    expect(el).toHaveAttribute("data-variant", variant);
    expect(el).toHaveClass(...classes);
  });

  it("interactive en lien : atteignable au clavier, sélection par bordure primary et aria-current", async () => {
    render(
      <Card variant="interactive" selected asChild>
        <a href="/projets/p1">Projet Atelier</a>
      </Card>,
    );
    await userEvent.tab();
    const link = screen.getByRole("link", { name: "Projet Atelier" });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute("aria-current", "true");
    expect(link).toHaveClass("border-primary");
    expect(link).toHaveClass("focus-visible:ring-2");
  });

  it("interactive en bouton : atteignable au clavier, non sélectionnée sans aria-current", async () => {
    render(
      <Card variant="interactive" asChild>
        <button type="button">Choisir</button>
      </Card>,
    );
    await userEvent.tab();
    const button = screen.getByRole("button", { name: "Choisir" });
    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute("aria-current");
    expect(button).not.toHaveClass("border-primary");
  });
});

describe("CardHeader", () => {
  it("titre 15/600, description, action à droite", () => {
    render(
      <Card>
        <CardHeader action={<Button size="sm">Modifier</Button>}>
          <CardTitle>Général</CardTitle>
          <CardDescription>Nom et description du projet</CardDescription>
        </CardHeader>
        <CardContent>Corps</CardContent>
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Général" })).toHaveClass("text-card-title");
    expect(screen.getByText("Nom et description du projet")).toHaveClass(
      "text-meta",
      "text-muted-foreground",
    );
    const action = screen.getByRole("button", { name: "Modifier" });
    const header = action.closest("[data-slot='card-header']");
    expect(header).toHaveClass("flex", "justify-between");
    expect(action.parentElement?.className).toMatch(/shrink-0/);
  });

  it("sans action : pas de conteneur d'action", () => {
    const { container } = render(
      <CardHeader>
        <CardTitle>T</CardTitle>
      </CardHeader>,
    );
    expect(container.querySelector("[data-slot='card-action']")).toBeNull();
  });
});
