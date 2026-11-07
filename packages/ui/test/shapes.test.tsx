// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  Select,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "../src/index.ts";

const noShadow = (el: Element | null) => expect(el?.className).not.toMatch(/(^|\s)shadow-/);

describe("formes (02-design.md §2)", () => {
  it("Button : rounded-md, h-9, sans ombre ; icon = size-9", () => {
    const { container } = render(<Button>OK</Button>);
    const b = container.querySelector("button");
    expect(b).toHaveClass("rounded-md", "h-9");
    noShadow(b);
    const icon = render(<Button size="icon" aria-label="x" />).container.querySelector("button");
    expect(icon).toHaveClass("size-9", "rounded-md");
  });

  it("Card : rounded-xl (12), bordure 1px, sans ombre", () => {
    const el = render(<Card />).container.firstElementChild;
    expect(el).toHaveClass("rounded-xl", "border");
    noShadow(el);
  });

  it("Badge : pastille rounded-full, sans ombre", () => {
    const el = render(<Badge>1</Badge>).container.firstElementChild;
    expect(el).toHaveClass("rounded-full");
    noShadow(el);
  });

  it("Alert : rounded-xl, bordure, sans ombre", () => {
    const el = render(<Alert>msg</Alert>).container.firstElementChild;
    expect(el).toHaveClass("rounded-xl", "border");
    noShadow(el);
  });

  it("Select trigger : h-10 rounded-lg (TK-138)", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Choix">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    expect(screen.getByRole("combobox")).toHaveClass("h-10", "rounded-lg");
  });

  it("Popover : rounded-xl shadow-floating (flottant, DESIGN.md v2 §2.1)", () => {
    render(
      <Popover open>
        <PopoverContent>contenu</PopoverContent>
      </Popover>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("rounded-xl", "shadow-floating");
  });

  it("DropdownMenu content : rounded-xl shadow-floating", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>ouvrir</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>a</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByRole("menu")).toHaveClass("rounded-xl", "shadow-floating");
  });

  it("Sheet content : shadow-sheet sur --raised (flottant)", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>t</SheetTitle>
          <SheetDescription>d</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("shadow-sheet", "bg-raised");
  });
});

describe("titres sur l'échelle v2 (DESIGN.md §3)", () => {
  it("titres par défaut sur l'échelle v2 : Sheet en dialogue (18/600), Card en 15/600", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Titre du panneau</SheetTitle>
          <SheetDescription>d</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("heading", { name: "Titre du panneau" })).toHaveClass(
      "text-dialog-title",
    );
    const { container } = render(
      <Card>
        <CardTitle>Titre de carte</CardTitle>
        <CardDescription>Texte</CardDescription>
      </Card>,
    );
    const h3 = container.querySelector("h3");
    expect(h3).toHaveClass("text-card-title");
    expect(h3?.className).not.toMatch(/text-base|tracking-\[/);
    expect(container.querySelector("p")).toHaveClass("text-meta");
  });
});
