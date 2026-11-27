// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThreatRow } from "../src/index.ts";

/** TK-117 lot C : ligne de menace (DESIGN.md §5.28, maquette 15 l.132, 497-509). */
describe("ThreatRow", () => {
  it("bouton nommé par l'identifiant, le titre, la gravité et l'état ; courant sur --secondary", async () => {
    const pick = vi.fn();
    render(
      <ThreatRow
        threatId="SEC-T08"
        title="Export du fichier"
        gravity="high"
        state="todo"
        current
        onClick={pick}
      />,
    );
    const row = screen.getByRole("button", {
      name: /SEC-T08 Export du fichier Gravité Élevée À traiter/,
    });
    expect(row).toHaveAttribute("aria-current", "true");
    expect(row.className).toContain("min-h-11");
    expect(row.className).toContain("aria-[current=true]:bg-secondary");
    await userEvent.setup().click(row);
    expect(pick).toHaveBeenCalledOnce();
  });

  it("une seule ligne à toute largeur : titre souple, pastilles à droite (l.132)", () => {
    render(<ThreatRow threatId="SEC-T01" title="Titre long" gravity="high" state="todo" />);
    const row = screen.getByRole("button");
    expect(row).not.toHaveClass("flex-wrap");
    expect(screen.getByText("Titre long")).toHaveClass("min-w-0", "flex-1", "break-words");
  });

  it.each([
    ["high", "ok", "Élevée", "danger", "Traitée", "success"],
    ["medium", "proposed", "Moyenne", "outline", "Proposée", "proposed"],
    ["low", "stale", "Faible", "outline", "À revoir", "warning"],
  ] as const)("pastilles %s / %s", (gravity, state, grave, graveTone, label, tone) => {
    render(<ThreatRow threatId="SEC-T01" title="Titre" gravity={gravity} state={state} />);
    expect(screen.getByText(grave).closest("[data-slot='pill']")).toHaveAttribute(
      "data-tone",
      graveTone,
    );
    expect(screen.getByText(label).closest("[data-slot='pill']")).toHaveAttribute(
      "data-tone",
      tone,
    );
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-current");
  });
});
