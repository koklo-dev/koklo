// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Checkbox,
  RadioCard,
  RadioCardGroup,
  RadioGroup,
  RadioGroupItem,
  Switch,
  SwitchRow,
} from "../src/index.ts";

/** TK-138 lot C : Switch, SwitchRow, Checkbox, RadioGroup, RadioCard. */

describe("Switch", () => {
  it("role=switch aria-checked, 38x22, rond blanc 16, fond primary / border-strong", () => {
    const { container } = render(<Switch aria-label="Secours" />);
    const sw = screen.getByRole("switch", { name: "Secours" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    for (const c of [
      "h-[22px]",
      "w-[38px]",
      "p-[3px]",
      "rounded-full",
      "data-[state=checked]:bg-primary",
      "bg-border-strong",
    ]) {
      expect(sw).toHaveClass(c);
    }
    expect(container.querySelector("span")).toHaveClass("size-4", "bg-switch-thumb");
  });

  it("Espace bascule ; désactivé ne bascule pas (opacity-60 seul cas)", async () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(<Switch aria-label="Secours" onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch");
    sw.focus();
    await userEvent.keyboard(" ");
    expect(sw).toHaveAttribute("aria-checked", "true");
    rerender(<Switch aria-label="Secours" disabled onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("switch").className).toMatch(/disabled:opacity-60/);
  });
});

describe("SwitchRow", () => {
  it("titre relié au switch, description associée, min-h-11", async () => {
    render(<SwitchRow title="Fournisseur de secours" description="Bascule automatique" />);
    const sw = screen.getByRole("switch", { name: "Fournisseur de secours" });
    expect(sw).toHaveAccessibleDescription("Bascule automatique");
    expect(sw.closest("[data-slot='switch-row']")).toHaveClass("min-h-11");
    await userEvent.click(screen.getByText("Fournisseur de secours"));
    expect(sw).toHaveAttribute("aria-checked", "true");
  });
});

describe("Checkbox", () => {
  it("role=checkbox, cible size-7, Espace coche, icône check_box pleine", async () => {
    const { container } = render(<Checkbox aria-label="Accepter" />);
    const box = screen.getByRole("checkbox", { name: "Accepter" });
    expect(box).toHaveClass("size-7");
    expect(container.querySelector("svg[data-icon='check_box_outline_blank']")).not.toBeNull();
    box.focus();
    await userEvent.keyboard(" ");
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(container.querySelector("svg[data-icon='check_box']")).not.toBeNull();
  });

  it("indéterminé : aria-checked=mixed", () => {
    render(<Checkbox aria-label="Tout" checked="indeterminate" />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed");
  });

  it("désactivé : ne se coche pas", async () => {
    render(<Checkbox aria-label="Figé" disabled />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  });
});

describe("RadioGroup", () => {
  it("radios 18 px bordure 2, Tab entre dans le groupe, flèches déplacent le choix", async () => {
    render(
      <>
        <button type="button">avant</button>
        <RadioGroup aria-label="Rôle" defaultValue="a">
          <RadioGroupItem value="a" aria-label="Option A" />
          <RadioGroupItem value="b" aria-label="Option B" />
        </RadioGroup>
      </>,
    );
    expect(screen.getByRole("radiogroup", { name: "Rôle" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Option A" })).toHaveClass("size-[18px]", "border-2");
    screen.getByRole("button", { name: "avant" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Option A" })).toHaveFocus();
    // Radix coche au focus tant que la flèche est tenue (son suivi keyup précède son setTimeout).
    await userEvent.keyboard("{ArrowDown>}");
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Option B" })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
  });
});

describe("RadioCard", () => {
  it("carte choisie : border-primary ring-1 ring-inset bg-diff-bg ; titre, description, badge", async () => {
    render(
      <RadioCardGroup aria-label="Fournisseur" defaultValue="a">
        <RadioCard
          value="a"
          title="Fournisseur A"
          description="Modèle par défaut"
          badge="Recommandé"
        />
        <RadioCard value="b" title="Fournisseur B" description="Secours" />
      </RadioCardGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "Fournisseur" });
    expect(group.className).toMatch(/minmax\(220px,1fr\)/);
    const a = screen.getByRole("radio", { name: /Fournisseur A/ });
    expect(a).toHaveAttribute("aria-checked", "true");
    for (const c of [
      "rounded-card",
      "p-3",
      "data-[state=checked]:border-primary",
      "data-[state=checked]:ring-1",
      "data-[state=checked]:ring-inset",
      "data-[state=checked]:bg-diff-bg",
    ]) {
      expect(a).toHaveClass(c);
    }
    expect(a).toHaveAccessibleDescription(/Modèle par défaut/);
    // Bouton radio visible (maquette 08 l.143) : rond de 18 avec point quand la carte est choisie.
    expect(a.querySelector("[data-slot=radio-card-mark]")).toHaveClass(
      "size-[18px]",
      "rounded-full",
    );
    expect(a.querySelector("[data-slot=radio-card-mark] span")).toHaveClass("bg-primary");
    expect(
      screen
        .getByRole("radio", { name: /Fournisseur B/ })
        .querySelector("[data-slot=radio-card-mark] span"),
    ).toBeNull();
    expect(screen.getByText("Fournisseur A").className).toMatch(/text-body/);
    expect(screen.getByText("Recommandé")).toBeVisible();
    await userEvent.click(screen.getByRole("radio", { name: /Fournisseur B/ }));
    expect(screen.getByRole("radio", { name: /Fournisseur B/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
