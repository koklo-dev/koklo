// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "../scripts/generate-icons.ts";
import { DECISION_STATUS_LABELS, DecisionStatus } from "../src/index.ts";

/** TK-113 lot B : pastille de statut d'une décision (DESIGN.md §5.24, maquette 13 l.549-553, 600). */
const root = () => document.querySelector("[data-slot='decision-status']") as HTMLElement;

describe("DecisionStatus", () => {
  it.each([
    ["acceptee", "Acceptée", "bg-status-validated text-status-validated-foreground"],
    ["proposee", "Proposée", "bg-status-pending text-status-pending-foreground"],
    ["remplacee", "Remplacée", "border border-border text-muted-foreground"],
  ] as const)(
    "%s : libellé écrit %s et teinte de la famille des statuts",
    (status, label, tone) => {
      render(<DecisionStatus status={status} />);
      expect(screen.getByText(label)).toBeVisible();
      expect(DECISION_STATUS_LABELS[status]).toBe(label);
      for (const token of tone.split(" ")) expect(root().className).toContain(token);
      expect(root().dataset.status).toBe(status);
    },
  );

  it("garde le gabarit des pastilles de statut : 24 px, 12/500, icône de 16", () => {
    render(<DecisionStatus status="acceptee" />);
    expect(root().className).toContain("h-6");
    expect(root().className).toContain("text-caption");
    expect(root().querySelector("svg")?.getAttribute("width")).toBe("16");
  });

  it("n'expose pas l'icône aux lecteurs d'écran", () => {
    render(<DecisionStatus status="remplacee" />);
    expect(root().querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(["add_circle", "do_not_disturb_on"])("l'icône %s figure au registre", (name) => {
    expect(ICON_NAMES).toContain(name);
  });
});
