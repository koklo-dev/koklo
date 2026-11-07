// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DeliverableStatus,
  Icon,
  type IconName,
  LifecycleStatus,
  StatusBadge,
  ValidationStatus,
} from "../src/index.ts";

/**
 * TK-87 CA2, cas 2.2 (passation 01 §0.3, DESIGN.md v2 §2.2 et §5.1, 02-design §2.3) : 4 tonalités,
 * icône pleine de 16 px, libellé toujours présent, libellé d'écran et icône `cancel` / `block` bornés.
 * Contrat d'observation retenu au Red : racine `data-slot="validation-status"` et `data-status`.
 */
const CASES = [
  {
    status: "validated",
    label: "Validée",
    icon: "check_circle",
    classes: ["bg-status-validated", "text-status-validated-foreground"],
  },
  {
    status: "pending",
    label: "À valider",
    icon: "schedule",
    classes: ["bg-status-pending", "text-status-pending-foreground"],
  },
  {
    status: "revise",
    label: "À revoir",
    icon: "edit_note",
    classes: ["bg-status-revise", "text-status-revise-foreground"],
  },
  {
    status: "unsubmitted",
    label: "Non soumise",
    icon: "remove",
    classes: ["bg-secondary", "text-muted-foreground"],
  },
] as const;

/** Tracé plein d'une icône du registre, pour comparer sans figer les données SVG dans le test. */
async function filledPath(name: IconName): Promise<string> {
  const { container, unmount } = render(<Icon name={name} size={16} fill />);
  let d = "";
  await waitFor(() => {
    d = container.querySelector("path")?.getAttribute("d") ?? "";
    expect(d, "tracé SVG absent : icône non générée ou non rendue").not.toBe("");
  });
  unmount();
  return d;
}

async function pathOf(root: Element): Promise<string> {
  let d = "";
  await waitFor(() => {
    d = root.querySelector("svg path")?.getAttribute("d") ?? "";
    expect(d, "tracé SVG absent : icône non générée ou non rendue").not.toBe("");
  });
  return d;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ValidationStatus", () => {
  it.each(CASES)("$status : libellé canonique « $label » et icône 16 px aria-hidden", (c) => {
    const { container } = render(<ValidationStatus status={c.status} />);
    const root = container.querySelector("[data-slot='validation-status']");
    expect(root).toHaveAttribute("data-status", c.status);
    expect(screen.getByText(c.label)).toBeInTheDocument();
    const svg = root?.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "16");
  });

  it.each(CASES)("$status : icône pleine $icon", async (c) => {
    const expected = await filledPath(c.icon);
    const { container } = render(<ValidationStatus status={c.status} />);
    const root = container.querySelector("[data-slot='validation-status']") as Element;
    expect(await pathOf(root)).toBe(expected);
  });

  it.each(CASES)("$status : pastille complète aux couleurs de §2.2", (c) => {
    const { container } = render(<ValidationStatus status={c.status} />);
    const root = container.querySelector("[data-slot='validation-status']");
    expect(root).toHaveClass("rounded-full", ...c.classes);
    expect(root?.className ?? "").not.toMatch(/primary|violet|purple/);
  });

  it("aucun rôle : texte statique", () => {
    const { container } = render(<ValidationStatus status="pending" />);
    expect(container.querySelector("[role]")).toBeNull();
  });

  it("libellé d'écran : « Acceptée » remplace le libellé canonique, tonalité conservée", () => {
    const { container } = render(<ValidationStatus status="validated" label="Acceptée" />);
    expect(screen.getByText("Acceptée")).toBeInTheDocument();
    expect(screen.queryByText("Validée")).toBeNull();
    expect(container.querySelector("[data-slot='validation-status']")).toHaveClass(
      "bg-status-validated",
    );
  });

  it.each(["cancel", "block"] as const)(
    "Non soumise + icône %s : l'icône surchargée remplace `remove`",
    async (icon) => {
      const expected = await filledPath(icon);
      const { container } = render(
        <ValidationStatus status="unsubmitted" label="Rejetée" icon={icon} />,
      );
      const root = container.querySelector("[data-slot='validation-status']") as Element;
      expect(screen.getByText("Rejetée")).toBeInTheDocument();
      expect(await pathOf(root)).toBe(expected);
    },
  );

  it("refuse au type une icône surchargée hors de la tonalité Non soumise", () => {
    // @ts-expect-error `icon` n'existe qu'avec status="unsubmitted"
    render(<ValidationStatus status="validated" icon="cancel" />);
  });

  it("refuse au type un statut inconnu", () => {
    // @ts-expect-error union fermée validated | pending | revise | unsubmitted
    render(<ValidationStatus status="unknown" />);
  });
});

describe("StatusBadge : alias déprécié qui délègue à ValidationStatus", () => {
  it.each(["validated", "pending", "revise"] as const)(
    "%s : même rendu que ValidationStatus",
    (status) => {
      const a = render(<StatusBadge status={status} label="Libellé" />).container.innerHTML;
      const b = render(<ValidationStatus status={status} label="Libellé" />).container.innerHTML;
      expect(a).toBe(b);
    },
  );
});

describe("TK-138 lot B : gabarit STATUS_PILL (Pill md)", () => {
  it("ValidationStatus : h-6, pl-1.5 pr-2.5, gap-1.5", () => {
    const { container } = render(<ValidationStatus status="validated" />);
    expect(container.firstElementChild).toHaveClass("h-6", "pl-1.5", "pr-2.5", "gap-1.5");
  });

  it("DeliverableStatus : même gabarit", () => {
    const { container } = render(<DeliverableStatus status="todo" />);
    expect(container.firstElementChild).toHaveClass("h-6", "pl-1.5", "gap-1.5");
  });

  it("LifecycleStatus : pl-2 gap-2", () => {
    const { container } = render(<LifecycleStatus stage={2} />);
    expect(container.firstElementChild).toHaveClass("h-6", "pl-2", "gap-2");
  });
});
