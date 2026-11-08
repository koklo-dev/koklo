import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vitest";
import {
  focusSelectionToolbar,
  IdeaSelectionToolbar,
  openToolbarOnShortcut,
} from "../src/components/idea-selection-toolbar.tsx";

function setup() {
  const editor = new Editor({
    extensions: [StarterKit],
    content: "<p>Annuler une réservation</p>",
  });
  editor.commands.setTextSelection({ from: 1, to: 7 });
  const onEscape = vi.fn();
  render(<IdeaSelectionToolbar editor={editor} onAgentAction={vi.fn()} onEscape={onEscape} />);
  return { editor, onEscape };
}

describe("Barre de sélection : accès au clavier (F15, B251)", () => {
  it("tabulation itinérante : seul « Gras » est dans l'ordre de tabulation", () => {
    setup();
    const tabbable = screen.getAllByRole("button").filter((b) => b.tabIndex === 0);
    expect(tabbable.map((b) => b.getAttribute("aria-label"))).toEqual(["Gras"]);
  });

  it("focusSelectionToolbar met le focus sur « Gras »", () => {
    const { editor } = setup();
    expect(focusSelectionToolbar(editor.view)).toBe(true);
    expect(screen.getByRole("button", { name: "Gras" })).toHaveFocus();
  });

  it("flèches, Fin et Origine parcourent les boutons, en boucle", async () => {
    const { editor } = setup();
    act(() => void focusSelectionToolbar(editor.view));
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Italique" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Italique" }).tabIndex).toBe(0);
    expect(screen.getByRole("button", { name: "Gras" }).tabIndex).toBe(-1);
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("button", { name: "En faire une page" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "Gras" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("button", { name: "En faire une page" })).toHaveFocus();
  });

  it("Échap : demande la fermeture et garde la sélection", async () => {
    const { editor, onEscape } = setup();
    act(() => void focusSelectionToolbar(editor.view));
    await userEvent.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalled();
    expect(editor.state.selection.empty).toBe(false);
  });

  it("Alt+F10 rouvre l'accès même juste après Échap (F17) ; sans sélection, il ne fait rien", async () => {
    const { editor } = setup();
    const press = () =>
      openToolbarOnShortcut(
        editor.view,
        new KeyboardEvent("keydown", { key: "F10", altKey: true, cancelable: true }),
      );
    act(() => void press());
    expect(screen.getByRole("button", { name: "Gras" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    act(() => editor.commands.focus());
    act(() => void press());
    expect(screen.getByRole("button", { name: "Gras" })).toHaveFocus();
    act(() => editor.commands.setTextSelection(3));
    expect(press()).toBe(false);
  });
});
