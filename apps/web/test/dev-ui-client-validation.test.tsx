import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DevUiClientValidation } from "../src/components/dev-ui-client-validation.tsx";

/** TK-104 : section « 20. Vue client » de la galerie (DESIGN.md §5.17, maquette 10 l.171-224, 296-330). */
describe("Galerie : vue client", () => {
  it("la section porte l'id dev-ui-client-validation et le titre 20", () => {
    const { container } = render(<DevUiClientValidation />);
    expect(container.querySelector("#dev-ui-client-validation")).toHaveTextContent(
      "20. Vue client",
    );
  });

  it("montre le bandeau ambre et neutre, la demande de changement, la confirmation rouge et la verte", () => {
    render(<DevUiClientValidation />);
    expect(screen.getAllByRole("note").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Marie Lefèvre · demande de changement")).toBeInTheDocument();
    expect(screen.getByText("Changement demandé à l'équipe pour ce parcours.")).toBeInTheDocument();
    expect(screen.getByText("Parcours validé.")).toBeInTheDocument();
  });

  it("l'invite se déplie en « Que faut-il changer ? » dans les deux poses", async () => {
    render(<DevUiClientValidation />);
    const bar = document.querySelector("[data-variant='bar']") as HTMLElement;
    await userEvent.click(within(bar).getByRole("button", { name: "Demander un changement" }));
    expect(within(bar).getByLabelText("Que faut-il changer ?")).toBeInTheDocument();
  });
});
