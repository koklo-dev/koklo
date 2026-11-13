import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataCommentDialog } from "../src/components/data-comment-dialog.tsx";
import { polyfillRadix } from "./support/web-mocks.ts";

/** TK-109 lot C, critère 8 : le dialogue « Commenter » (B448), même motif que les dialogues du client. */
const base = { open: true, tableName: "Client", pending: false, failed: false };

describe("DataCommentDialog", () => {
  it("titre nommant la table, champ « Votre commentaire », « Envoyer » désactivé tant que vide", () => {
    polyfillRadix();
    render(<DataCommentDialog {...base} onOpenChange={vi.fn()} onSubmit={vi.fn()} />);
    expect(
      screen.getByRole("dialog", { name: "Commenter la table « Client »" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Votre commentaire" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  });

  it("envoie le texte saisi, sans espaces de bordure", async () => {
    polyfillRadix();
    const onSubmit = vi.fn();
    render(<DataCommentDialog {...base} onOpenChange={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox"), "  Il manque le prénom  ");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(onSubmit).toHaveBeenCalledWith("Il manque le prénom");
  });

  it("échec : alerte « n'a pas pu être envoyé », le texte reste et le champ reprend le focus", async () => {
    polyfillRadix();
    render(<DataCommentDialog {...base} failed onOpenChange={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Le commentaire n'a pas pu être envoyé");
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveFocus());
  });

  it("envoi en cours : « Envoyer » désactivé", () => {
    polyfillRadix();
    render(<DataCommentDialog {...base} pending onOpenChange={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Envoyer/ })).toBeDisabled();
  });

  it("Échap et « Annuler » demandent la fermeture", async () => {
    polyfillRadix();
    const onOpenChange = vi.fn();
    render(<DataCommentDialog {...base} onOpenChange={onOpenChange} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
