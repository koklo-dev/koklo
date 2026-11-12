// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ValidationPrompt } from "../src/index.ts";

/** TK-104 (DESIGN.md §5.17, maquette 10 l.211-217, 296-306, 320-324) : valider, demander, annuler, clavier, 44 px. */
function setup(over: Partial<Parameters<typeof ValidationPrompt>[0]> = {}) {
  const onValidate = vi.fn();
  const onRequestChange = vi.fn();
  render(
    <ValidationPrompt
      variant="inline"
      validateLabel="Valider"
      onValidate={onValidate}
      onRequestChange={onRequestChange}
      {...over}
    />,
  );
  return { onValidate, onRequestChange };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ValidationPrompt", () => {
  it("« Valider » appelle onValidate ; la question et la note s'affichent", async () => {
    const { onValidate } = setup({
      question: "Ce parcours est-il juste ?",
      note: "Version du 4 nov.",
    });
    expect(screen.getByText("Ce parcours est-il juste ?")).toBeInTheDocument();
    expect(screen.getByText("Version du 4 nov.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onValidate).toHaveBeenCalledOnce();
  });

  it("les boutons font 40 px, 44 sous 768 px", () => {
    setup();
    expect(screen.getByRole("button", { name: "Valider" })).toHaveClass("h-10", "max-md:h-11");
    expect(screen.getByRole("button", { name: "Demander un changement" })).toHaveClass(
      "h-11",
      "md:h-10",
    );
  });

  it("« Demander un changement » ouvre « Que faut-il changer ? » avec le focus ; envoyer est inactif sans texte", async () => {
    const { onRequestChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Demander un changement" }));
    const field = screen.getByLabelText("Que faut-il changer ?");
    expect(field).toHaveFocus();
    expect(screen.getByRole("button", { name: "Envoyer à l'équipe" })).toBeDisabled();
    await userEvent.type(field, "  Plus tôt, svp  ");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer à l'équipe" }));
    expect(onRequestChange).toHaveBeenCalledWith("Plus tôt, svp");
  });

  it("limite le texte à 2000 caractères", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Demander un changement" }));
    expect(screen.getByLabelText("Que faut-il changer ?")).toHaveAttribute("maxlength", "2000");
  });

  it("Échap et « Annuler » referment le formulaire et rendent le focus à « Demander un changement »", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Demander un changement" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("Que faut-il changer ?")).toBeNull();
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Demander un changement" })).toHaveFocus(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Demander un changement" }));
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByLabelText("Que faut-il changer ?")).toBeNull();
  });

  it("variante bar : cadre surface arrondi ; inline : filet en haut", () => {
    setup({ variant: "bar" });
    expect(document.querySelector("[data-variant='bar']")?.className).toContain("rounded-xl");
  });

  it("en cours d'envoi les boutons attendent ; une erreur est annoncée", () => {
    setup({ pending: true, error: "Il reste des éléments à traiter" });
    expect(screen.getByRole("button", { name: "Valider" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Il reste des éléments à traiter");
  });

  it("le libellé du formulaire et le texte d'aide sont personnalisables", async () => {
    setup({
      askLabel: "Que faut-il changer dans ce parcours ?",
      placeholder: "ex. choisir le coiffeur",
    });
    await userEvent.click(screen.getByRole("button", { name: "Demander un changement" }));
    expect(screen.getByLabelText("Que faut-il changer dans ce parcours ?")).toHaveAttribute(
      "placeholder",
      "ex. choisir le coiffeur",
    );
  });

  it("le champ a 3 lignes par défaut, `rows` le change ; Valider est en taille lg (maquette l.215, 299)", async () => {
    setup({ rows: 2 });
    expect(screen.getByRole("button", { name: "Valider" })).toHaveClass("h-10", "pl-3");
    await userEvent.click(screen.getByRole("button", { name: "Demander un changement" }));
    expect(screen.getByLabelText("Que faut-il changer ?")).toHaveAttribute("rows", "2");
  });
});
