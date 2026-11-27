// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OperationFicheTitle, OperationKindPill, OperationRow } from "../src/index.ts";

/** TK-116 lot B : ligne, pastille de type et titre d'une opération (DESIGN.md §5.27, maquette 14 l.230, 239-241, 601). */
function row(props: Partial<Parameters<typeof OperationRow>[0]> = {}) {
  return render(
    <OperationRow
      name="reservation.create"
      summary="Crée une réservation."
      permission="reservation.creer"
      type="write"
      onSelect={() => undefined}
      {...props}
    />,
  );
}
const button = () => screen.getByRole("button");

describe("OperationKindPill", () => {
  it.each([
    ["write", "écriture", "soft"],
    ["read", "lecture", "outline"],
    ["internal", "interne", "dashed"],
  ] as const)("%s : « %s », ton %s, 72 de large", (type, label, tone) => {
    render(<OperationKindPill type={type} />);
    const pill = screen.getByText(label);
    expect(pill).toHaveAttribute("data-tone", tone);
    expect(pill).toHaveAttribute("data-size", "sm");
    expect(pill.className).toContain("w-[72px]");
  });
});

describe("OperationRow", () => {
  it("bouton nommé par le type, le nom, le résumé et la permission ; nom en mono", () => {
    row();
    expect(button()).toHaveAccessibleName(
      "écriture reservation.create Crée une réservation. reservation.creer",
    );
    expect(screen.getByText("reservation.create").className).toContain("font-mono");
    expect(screen.getByText("Crée une réservation.").className).toContain("truncate");
    expect(button()).toHaveAttribute("aria-current", "false");
  });

  it("courante : aria-current et fond secondaire ; le clic sélectionne", async () => {
    const onSelect = vi.fn();
    row({ current: true, onSelect });
    expect(button()).toHaveAttribute("aria-current", "true");
    expect(button().className).toContain("bg-secondary");
    await userEvent.click(button());
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("proposée : bord gauche pointillé ; la ligne porte son identifiant", () => {
    const { container } = row({ proposed: true });
    expect(button().className).toContain("border-dashed");
    expect(button().className).toContain("border-l-[3px]");
    expect(container.querySelector('[data-spec-id="reservation.create"] button')).not.toBeNull();
  });
});

describe("OperationFicheTitle", () => {
  it("titre de niveau 2 en mono", () => {
    render(<OperationFicheTitle>reservation.cancel</OperationFicheTitle>);
    const title = screen.getByRole("heading", { level: 2, name: "reservation.cancel" });
    expect(title.className).toContain("font-mono");
    expect(title.className).toContain("text-[20px]");
  });
});
