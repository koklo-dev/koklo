// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination, pageItems } from "../src/index.ts";

/**
 * TK-94 lot B, T17 (passation 07 §1.2 et §5, DESIGN.md v2.1 §5.3) : `Pagination` par décalage.
 * « 1–25 sur 1 240 », précédent / suivant, numéros avec ellipses, page courante `aria-current="page"`.
 */
describe("pageItems : numéros avec ellipses", () => {
  it("1 … 19 20 21 … 50 depuis la page 20", () => {
    expect(pageItems(20, 50)).toEqual([1, "gap", 19, 20, 21, "gap", 50]);
  });

  it("aucune ellipse quand tout tient", () => {
    expect(pageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("une page isolée est affichée plutôt qu'une ellipse", () => {
    expect(pageItems(4, 50)).toEqual([1, 2, 3, 4, 5, "gap", 50]);
    expect(pageItems(47, 50)).toEqual([1, "gap", 46, 47, 48, 49, 50]);
  });

  it("aux extrémités", () => {
    expect(pageItems(1, 50)).toEqual([1, 2, "gap", 50]);
    expect(pageItems(50, 50)).toEqual([1, "gap", 49, 50]);
    expect(pageItems(1, 1)).toEqual([1]);
  });
});

const nav = () => screen.getByRole("navigation", { name: "Pagination" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Pagination", () => {
  const base = {
    total: 1240,
    size: 25 as const,
    onPageChange: () => undefined,
    onSizeChange: () => undefined,
  };

  it("nav nommée « Pagination » avec le texte « 1–25 sur 1 240 »", () => {
    render(<Pagination {...base} page={1} />);
    expect(nav()).toHaveTextContent("1–25 sur 1 240");
  });

  it("dernière page : borne haute = total (« 1 226–1 240 sur 1 240 »)", () => {
    render(<Pagination {...base} page={50} />);
    expect(nav()).toHaveTextContent("1 226–1 240 sur 1 240");
  });

  it("page courante : aria-current=page, fond --primary ; les autres sans", () => {
    render(<Pagination {...base} page={20} />);
    const current = within(nav()).getByRole("button", { name: "Page 20" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.className).toMatch(/bg-primary/);
    expect(within(nav()).getByRole("button", { name: "Page 19" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("1 … 19 20 21 … 50 : les ellipses ne sont pas focalisables", () => {
    render(<Pagination {...base} page={20} />);
    const labels = within(nav())
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual(expect.arrayContaining(["1", "19", "20", "21", "50"]));
    const gaps = nav().querySelectorAll("[data-slot='pagination-gap']");
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) {
      expect(gap).toHaveAttribute("aria-hidden", "true");
      expect(gap.getAttribute("tabindex")).toBeNull();
      expect(gap.tagName).not.toBe("BUTTON");
    }
  });

  it("boutons nommés « Page précédente » et « Page suivante »", async () => {
    const onPageChange = vi.fn();
    render(<Pagination {...base} page={20} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Page précédente" }));
    await userEvent.click(screen.getByRole("button", { name: "Page suivante" }));
    await userEvent.click(screen.getByRole("button", { name: "Page 21" }));
    expect(onPageChange.mock.calls.map(([p]) => p)).toEqual([19, 21, 21]);
  });

  it("précédent désactivé en page 1, suivant en dernière page, sans texte de raison", () => {
    const { rerender } = render(<Pagination {...base} page={1} />);
    const previous = screen.getByRole("button", { name: "Page précédente" });
    expect(previous).toBeDisabled();
    expect(previous).not.toHaveAccessibleDescription();
    expect(screen.queryByText("Première page")).toBeNull();
    expect(screen.queryByText("Dernière page")).toBeNull();
    rerender(<Pagination {...base} page={50} />);
    const next = screen.getByRole("button", { name: "Page suivante" });
    expect(next).toBeDisabled();
    expect(next).not.toHaveAccessibleDescription();
    expect(screen.queryByText("Dernière page")).toBeNull();
    expect(screen.getByRole("button", { name: "Page précédente" })).toBeEnabled();
  });

  it("estimation sans suite : suivant désactivé sans texte de raison", () => {
    render(<Pagination {...base} page={3} totalIsEstimate hasNext={false} />);
    expect(screen.getByRole("button", { name: "Page suivante" })).toBeDisabled();
    expect(screen.queryByText("Dernière page")).toBeNull();
  });

  it("ordre : plage, Lignes par page, précédent, numéros, suivant", () => {
    render(<Pagination {...base} page={20} />);
    const order = within(nav())
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(order.slice(0, 5)).toEqual(["25", "50", "100", "Page précédente", "Page 1"]);
    expect(order.at(-1)).toBe("Page suivante");
    expect(nav().firstElementChild).toHaveTextContent("476–500 sur 1 240");
  });

  it("boutons de 32 px (h-8), numéros mono bordés, courante sur --primary", () => {
    render(<Pagination {...base} page={20} />);
    const previous = screen.getByRole("button", { name: "Page précédente" });
    expect(previous.className).toMatch(/\bh-8\b/);
    const other = screen.getByRole("button", { name: "Page 19" });
    for (const cls of [/\bh-8\b/, /\bmin-w-8\b/, /font-mono/, /\bborder\b/, /border-border/]) {
      expect(other.className).toMatch(cls);
    }
    const current = screen.getByRole("button", { name: "Page 20" });
    expect(current.className).toMatch(/bg-primary/);
    expect(current.className).toMatch(/font-mono/);
  });

  it("la cible tactile fait au moins 24 px (2.5.8)", () => {
    render(<Pagination {...base} page={3} />);
    for (const button of within(nav()).getAllByRole("button")) {
      expect(button.className).toMatch(/\b(?:size|h)-(?:6|7|8|9|10)\b|\bmin-w-(?:7|8|9)\b/);
    }
  });

  it("Lignes par page : groupe SegmentedControl xs 25 / 50 / 100, aria-pressed", async () => {
    const onSizeChange = vi.fn();
    render(<Pagination {...base} page={1} onSizeChange={onSizeChange} />);
    const group = within(nav()).getByRole("group", { name: "Lignes par page" });
    expect(group.querySelector("[data-slot='segmented-control']") ?? group).toBeTruthy();
    expect(within(group).getByRole("button", { name: "25" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(group).getByRole("button", { name: "50" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(group).getByRole("button", { name: "25" }).className).toMatch(/\bh-6\b/);
    expect(within(nav()).queryByRole("combobox")).toBeNull();
    await userEvent.click(within(group).getByRole("button", { name: "50" }));
    expect(onSizeChange).toHaveBeenCalledWith(50);
  });

  it("au-delà de 10 000 lignes : « environ 12 000 », précédent / suivant seulement", () => {
    render(<Pagination {...base} total={12000} totalIsEstimate page={3} />);
    expect(nav()).toHaveTextContent("51–75 sur environ 12 000");
    expect(within(nav()).queryByRole("button", { name: "Page 4" })).toBeNull();
    expect(screen.getByRole("button", { name: "Page précédente" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Page suivante" })).toBeEnabled();
  });

  it("aucune ligne : texte « 0 sur 0 » et rien à parcourir", () => {
    render(<Pagination {...base} total={0} page={1} />);
    expect(nav()).toHaveTextContent("0 sur 0");
    expect(screen.getByRole("button", { name: "Page suivante" })).toBeDisabled();
  });
});

describe("Pagination : écarts de la planche 12 l.84", () => {
  it("12 entre les enfants et entre les numéros", () => {
    render(
      <Pagination page={2} size={25} total={1240} onPageChange={vi.fn()} onSizeChange={vi.fn()} />,
    );
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(nav).toHaveClass("gap-x-3");
    expect(nav.querySelector("ol")).toHaveClass("gap-3");
  });
});
