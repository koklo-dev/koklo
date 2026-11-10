// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterChip, OptionChip, SegmentedControl } from "../src/index.ts";

/** TK-138 lot C : FilterChip, OptionChip, SegmentedControl (catalogue §1.3, fiche lot C). */

describe("FilterChip", () => {
  it("h-7 rounded-full px-3 text-caption, inactif : border bg-background text-foreground (maquette 08 l.223)", () => {
    render(<FilterChip>Tous</FilterChip>);
    const chip = screen.getByRole("button", { name: "Tous" });
    for (const c of [
      "h-7",
      "rounded-full",
      "px-3",
      "text-caption",
      "border",
      "bg-background",
      "text-foreground",
    ]) {
      expect(chip).toHaveClass(c);
    }
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("bascule aria-pressed au clic et à Espace ; actif : border-primary bg-secondary", async () => {
    const onPressedChange = vi.fn();
    render(<FilterChip onPressedChange={onPressedChange}>À valider</FilterChip>);
    const chip = screen.getByRole("button", { name: "À valider" });
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    for (const c of ["border-primary", "bg-secondary", "text-secondary-foreground"]) {
      expect(chip).toHaveClass(c);
    }
    chip.focus();
    await userEvent.keyboard(" ");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(onPressedChange).toHaveBeenNthCalledWith(1, true);
    expect(onPressedChange).toHaveBeenNthCalledWith(2, false);
  });

  it("count affiche le compteur dans le nom accessible", () => {
    render(<FilterChip count={12}>Ouverts</FilterChip>);
    expect(screen.getByRole("button", { name: /Ouverts.*12/ })).toBeVisible();
  });

  it("add : pointillé border-border-strong, icône add, sans aria-pressed", () => {
    const { container } = render(<FilterChip add>Ajouter un filtre</FilterChip>);
    const chip = screen.getByRole("button", { name: "Ajouter un filtre" });
    expect(chip).toHaveClass("border-dashed", "border-border-strong");
    expect(chip).not.toHaveAttribute("aria-pressed");
    expect(container.querySelector("svg[data-icon='add']")).not.toBeNull();
  });

  it("désactivé : pointillé, jamais opacity-50", () => {
    render(<FilterChip disabled>Figé</FilterChip>);
    const chip = screen.getByRole("button", { name: "Figé" });
    expect(chip).toBeDisabled();
    expect(chip.className).not.toMatch(/opacity-50/);
    expect(chip.className).toMatch(/disabled:border-dashed/);
  });
});

describe("OptionChip", () => {
  it("rend un role=option h-8 avec aria-selected", () => {
    render(
      <div role="listbox" aria-label="Modèles">
        <OptionChip selected>modele-1</OptionChip>
        <OptionChip>modele-2</OptionChip>
      </div>,
    );
    const [a, b] = screen.getAllByRole("option");
    expect(a).toHaveAttribute("aria-selected", "true");
    expect(b).toHaveAttribute("aria-selected", "false");
    expect(a).toHaveClass(
      "h-8",
      "rounded-full",
      "text-meta",
      "border-2",
      "border-primary",
      "bg-secondary",
      "text-secondary-foreground",
    );
    expect(b).not.toHaveClass("border-primary");
  });

  it("mono pour le texte technique ; onSelect au clic", async () => {
    const onSelect = vi.fn();
    render(
      <div role="listbox" aria-label="Modèles">
        <OptionChip mono onSelect={onSelect}>
          modele-1
        </OptionChip>
      </div>,
    );
    const option = screen.getByRole("option", { name: "modele-1" });
    expect(option).toHaveClass("font-mono");
    await userEvent.click(option);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

const OPTIONS = [
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre", icon: "dark_mode" as const },
  { value: "auto", label: "Auto" },
];

describe("SegmentedControl, mode pressed (défaut)", () => {
  it("role=group nommé, un seul segment actif via aria-pressed", async () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Thème"
        options={OPTIONS}
        defaultValue="light"
        onValueChange={onValueChange}
      />,
    );
    const group = screen.getByRole("group", { name: "Thème" });
    expect(group).toHaveClass(
      "inline-flex",
      "gap-0.5",
      "p-[3px]",
      "rounded-lg",
      "border",
      "bg-surface",
    );
    expect(screen.getByRole("button", { name: "Clair" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Sombre" }));
    expect(onValueChange).toHaveBeenCalledWith("dark");
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Sombre" })).toHaveAttribute("aria-pressed", "true");
  });

  it("actif neutre : bg-background ring-1 ring-border text-foreground, AUCUN bg-primary", () => {
    render(<SegmentedControl aria-label="Thème" options={OPTIONS} defaultValue="light" />);
    const active = screen.getByRole("button", { name: "Clair" });
    for (const c of [
      "bg-background",
      "ring-1",
      "ring-border",
      "text-foreground",
      "h-[26px]",
      "px-2.5",
      "rounded-md",
      "text-caption",
    ]) {
      expect(active).toHaveClass(c);
    }
    const inactive = screen.getByRole("button", { name: "Auto" });
    expect(inactive).toHaveClass("text-muted-foreground");
    for (const el of [active, inactive, screen.getByRole("group")]) {
      expect(el.className).not.toMatch(/bg-primary/);
    }
  });

  it("size xs : h-6 ; icône 16 facultative", () => {
    const { container } = render(
      <SegmentedControl aria-label="Lignes" size="xs" options={OPTIONS} defaultValue="dark" />,
    );
    expect(screen.getByRole("button", { name: "Sombre" })).toHaveClass("h-6");
    expect(container.querySelector("svg[data-icon='dark_mode']")).toHaveAttribute("width", "16");
  });
});

describe("SegmentedControl, mode radio", () => {
  it("role=radiogroup, radios, flèches déplacent la sélection", async () => {
    render(
      <SegmentedControl aria-label="Thème" mode="radio" options={OPTIONS} defaultValue="light" />,
    );
    expect(screen.getByRole("radiogroup", { name: "Thème" })).toBeVisible();
    const light = screen.getByRole("radio", { name: "Clair" });
    expect(light).toHaveAttribute("aria-checked", "true");
    light.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Sombre" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Sombre" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
  });
});
