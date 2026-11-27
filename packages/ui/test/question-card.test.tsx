// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuestionCard } from "../src/index.ts";

/** TK-117 lot C : question du client (maquette 15 l.212). */
describe("QuestionCard", () => {
  it("zone de 3 lignes au focus ; envoi désactivé à vide ; Ctrl Entrée envoie ; Échap annule", async () => {
    const send = vi.fn();
    const cancel = vi.fn();
    const change = vi.fn();
    const { rerender } = render(
      <QuestionCard
        title="Votre question à l'équipe"
        value=""
        onChange={change}
        onSend={send}
        onCancel={cancel}
      />,
    );
    const area = screen.getByRole("textbox", { name: "Votre question à l'équipe" });
    expect(area).toHaveFocus();
    expect(area).toHaveAttribute("rows", "3");
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
    rerender(
      <QuestionCard
        title="Votre question à l'équipe"
        value="Bonjour"
        onChange={change}
        onSend={send}
        onCancel={cancel}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "{Control>}{Enter}{/Control}");
    expect(send).toHaveBeenCalledOnce();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
