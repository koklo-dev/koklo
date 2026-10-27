// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Alert,
  Badge,
  Button,
  Card,
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

  it("Card : rounded-lg, bordure 1px, sans ombre", () => {
    const el = render(<Card />).container.firstElementChild;
    expect(el).toHaveClass("rounded-lg", "border");
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

  it("Select trigger : h-9 rounded-md", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Choix">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    expect(screen.getByRole("combobox")).toHaveClass("h-9", "rounded-md");
  });

  it("Popover : rounded-xl shadow-md (flottant)", () => {
    render(
      <Popover open>
        <PopoverContent>contenu</PopoverContent>
      </Popover>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("rounded-xl", "shadow-md");
  });

  it("DropdownMenu content : rounded-xl shadow-md", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>ouvrir</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>a</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByRole("menu")).toHaveClass("rounded-xl", "shadow-md");
  });

  it("Sheet content : shadow-md (flottant)", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>t</SheetTitle>
          <SheetDescription>d</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("shadow-md");
  });
});
