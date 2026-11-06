// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeliverableStatus, Icon, type IconName, PriorityIndicator } from "../src/index.ts";

/**
 * TK-87 CA2, cas 2.3 et 2.4 (passation 01 §0.3, DESIGN.md v2 §5.1, 02-design §2.3).
 * Contrat d'observation retenu au Red : `data-slot="deliverable-status"` / `data-slot="priority-indicator"`,
 * barres `data-active`.
 */
const DELIVERABLES = [
  {
    status: "todo",
    label: "À faire",
    icon: "radio_button_unchecked",
    classes: ["bg-secondary", "text-foreground"],
  },
  {
    status: "in_progress",
    label: "En cours",
    icon: "edit",
    classes: ["bg-secondary", "text-foreground"],
  },
  {
    status: "pending",
    label: "À valider",
    icon: "schedule",
    classes: ["bg-status-pending", "text-status-pending-foreground"],
  },
  {
    status: "validated",
    label: "Validé",
    icon: "check_circle",
    classes: ["bg-status-validated", "text-status-validated-foreground"],
  },
] as const;

async function pathIn(root: Element): Promise<string> {
  let d = "";
  await waitFor(() => {
    d = root.querySelector("svg path")?.getAttribute("d") ?? "";
    expect(d, "tracé SVG absent : icône non générée ou non rendue").not.toBe("");
  });
  return d;
}

/** Tracés plein et contour d'une icône du registre (le gabarit ne fige pas le remplissage). */
async function iconPaths(name: IconName): Promise<string[]> {
  const out: string[] = [];
  for (const fill of [true, false]) {
    const { container, unmount } = render(<Icon name={name} size={16} fill={fill} />);
    out.push(await pathIn(container));
    unmount();
  }
  return out;
}

const root = (c: HTMLElement, slot: string) => c.querySelector(`[data-slot='${slot}']`);

describe("DeliverableStatus", () => {
  it.each(DELIVERABLES)("$status : « $label », icône 16 px aria-hidden, couleurs", (d) => {
    const { container } = render(<DeliverableStatus status={d.status} />);
    const el = root(container, "deliverable-status");
    expect(el).toHaveTextContent(d.label);
    expect(el).toHaveClass("rounded-full", ...d.classes);
    const svg = el?.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "16");
  });

  it.each(DELIVERABLES)("$status : icône $icon", async (d) => {
    const expected = await iconPaths(d.icon);
    const { container } = render(<DeliverableStatus status={d.status} />);
    expect(expected).toContain(await pathIn(root(container, "deliverable-status") as Element));
  });

  it.each(DELIVERABLES)("$status compact : libellé visible, même icône", (d) => {
    const { container } = render(<DeliverableStatus status={d.status} compact />);
    expect(screen.getByText(d.label)).toBeVisible();
    expect(screen.getByText(d.label)).not.toHaveClass("sr-only");
    expect(root(container, "deliverable-status")?.querySelector("svg")).not.toBeNull();
  });

  it.each(DELIVERABLES)("$status compact sans libellé : nom réservé aux lecteurs d'écran", (d) => {
    render(<DeliverableStatus status={d.status} compact hideLabel />);
    const label = screen.getByText(d.label);
    expect(label).toHaveClass("sr-only");
  });

  it("refuse au type hideLabel sans compact", () => {
    // @ts-expect-error hideLabel n'existe qu'avec compact
    render(<DeliverableStatus status="todo" hideLabel />);
  });
});

const PRIORITIES = [
  [3, "Indispensable"],
  [2, "Importante"],
  [1, "Souhaitable"],
  [0, "Reportée"],
] as const;

describe("PriorityIndicator", () => {
  it.each(PRIORITIES)("niveau %i : libellé « %s » toujours rendu", (level, label) => {
    const { container } = render(<PriorityIndicator level={level} label={label} />);
    const el = root(container, "priority-indicator");
    expect(el).toHaveAttribute("data-level", String(level));
    expect(screen.getByText(label)).toBeVisible();
  });

  it.each(PRIORITIES)(
    "niveau %i : 3 barres décoratives, autant d'actives que le niveau",
    (level, label) => {
      const { container } = render(<PriorityIndicator level={level} label={label} />);
      const bars = root(container, "priority-indicator")?.querySelector("[aria-hidden='true']");
      expect(bars, "barres aria-hidden").not.toBeNull();
      const all = bars?.querySelectorAll("[data-active]") ?? [];
      expect(all).toHaveLength(3);
      const active = [...all].filter((b) => b.getAttribute("data-active") === "true");
      expect(active).toHaveLength(level);
    },
  );

  it("barres actives en --foreground, inactives en --border-strong (jamais la couleur seule)", () => {
    const { container } = render(<PriorityIndicator level={1} label="Souhaitable" />);
    const bars = [...container.querySelectorAll("[data-active]")];
    expect(bars[0]).toHaveClass("bg-foreground");
    for (const bar of bars.slice(1)) expect(bar).toHaveClass("bg-border-strong");
  });

  it("libellé de ticket réutilisé tel quel (B23)", () => {
    render(<PriorityIndicator level={2} label="Priorité haute" />);
    expect(screen.getByText("Priorité haute")).toBeVisible();
  });

  it("refuse au type un niveau hors 0..3 et l'absence de libellé", () => {
    // @ts-expect-error level borné à 0 | 1 | 2 | 3
    render(<PriorityIndicator level={4} label="x" />);
    // @ts-expect-error label obligatoire
    render(<PriorityIndicator level={1} />);
  });
});
