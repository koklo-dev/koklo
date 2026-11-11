import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DevUiProposals } from "../src/components/dev-ui-proposals.tsx";

/** TK-99b lot A : section « Propositions de l'agent » de la galerie /dev/ui (DESIGN.md §5.13). */
const region = () => screen.getByRole("region", { name: "16. Propositions de l'agent" });

describe("galerie /dev/ui : section Propositions de l'agent", () => {
  it("région nommée, cinq états du bouton, aucun nom de fournisseur", () => {
    render(<DevUiProposals />);
    const states = within(region());
    expect(states.getAllByRole("button", { name: "Proposer avec l'agent" })).toHaveLength(4);
    expect(states.getByRole("button", { name: "L'agent propose…" })).toBeVisible();
    expect(states.getByRole("button", { name: "Relire 3 propositions" })).toBeVisible();
    expect(region().textContent).not.toMatch(/anthropic|openai|claude/i);
  });

  it("la modale s'ouvre depuis le bouton de la galerie", async () => {
    render(<DevUiProposals />);
    const user = userEvent.setup();
    const frame = within(region()).getByRole("heading", { name: "AgentProposePopover" })
      .parentElement as HTMLElement;
    await user.click(within(frame).getByRole("button", { name: "Proposer avec l'agent" }));
    expect(screen.getByRole("dialog", { name: "Proposer avec l'agent" })).toBeVisible();
  });

  it("génération : bandeau d'état et six lignes fantômes", () => {
    render(<DevUiProposals />);
    expect(within(region()).getByText(/L'agent rédige le cahier fonctionnel/)).toBeVisible();
    expect(region().querySelectorAll("[data-slot=proposal-skeleton] > div")).toHaveLength(6);
  });

  it("deux relectures : 12 propositions à plat, 400 en groupes avec filtres", () => {
    render(<DevUiProposals />);
    const reviews = within(region()).getAllByRole("region", { name: "Relecture des propositions" });
    expect(reviews).toHaveLength(2);
    expect(
      within(reviews[0] as HTMLElement).getByRole("list", { name: "Propositions à relire" }),
    ).toBeVisible();
    const volume = within(reviews[1] as HTMLElement);
    expect(volume.getByRole("list", { name: "Propositions par groupe" })).toBeVisible();
    expect(volume.getByRole("button", { name: /^À relire/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      volume.getAllByRole("button", { name: /^Accepter les \d+ restantes de / }).length,
    ).toBeGreaterThan(3);
  });

  it("accepter une proposition met à jour le décompte de la relecture à plat", async () => {
    render(<DevUiProposals />);
    const flat = within(
      within(region()).getAllByRole("region", {
        name: "Relecture des propositions",
      })[0] as HTMLElement,
    );
    await userEvent.setup().click(flat.getByRole("button", { name: /^Accepter/ }));
    expect(flat.getByRole("group", { name: "Mode relecture" })).toHaveTextContent("1 acceptée");
    expect(flat.getByRole("status")).toHaveTextContent("F-006 acceptée");
  });
});
