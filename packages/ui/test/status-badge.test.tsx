// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "../src/index.ts";

const CASES = [
  {
    status: "validated",
    label: "Validé",
    classes: ["bg-status-validated", "text-status-validated-foreground"],
  },
  {
    status: "pending",
    label: "En attente",
    classes: ["bg-status-pending", "text-status-pending-foreground"],
  },
  {
    status: "revise",
    label: "À revoir",
    classes: ["bg-status-revise", "text-status-revise-foreground"],
  },
] as const;

describe("CA3 : StatusBadge rend toujours une icône", () => {
  it.each(CASES)("$status : svg pleine aria-hidden + libellé texte", ({ status, label }) => {
    const { container } = render(<StatusBadge status={status} label={label} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "16");
    expect(svg?.querySelector("path")?.getAttribute("d")).toBeTruthy();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("les trois statuts utilisent trois icônes distinctes", () => {
    const paths = CASES.map(({ status, label }) => {
      const { container, unmount } = render(<StatusBadge status={status} label={label} />);
      const d = container.querySelector("path")?.getAttribute("d");
      unmount();
      return d;
    });
    expect(new Set(paths).size).toBe(3);
  });

  it.each(CASES)(
    "$status : pastille et classes de couleur status-*",
    ({ status, label, classes }) => {
      const { container } = render(<StatusBadge status={status} label={label} />);
      const root = container.firstElementChild;
      expect(root).toHaveClass("rounded-full", ...classes);
    },
  );

  it("refuse au type un statut inconnu", () => {
    // @ts-expect-error union fermée validated | pending | revise
    render(<StatusBadge status="unknown" label="?" />);
  });
});
