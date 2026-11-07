// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../src/index.ts";

/** TK-139 lot B, cas 11 (fiche §3) : `AlertDialog`. */
function Demo({ onConfirm = () => undefined }: { onConfirm?: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger>Supprimer</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader icon="warning">
          <AlertDialogTitle>Supprimer le projet ?</AlertDialogTitle>
          <AlertDialogDescription>Cette action est définitive.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Supprimer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe("AlertDialog", () => {
  it("role alertdialog, titre et description reliés, mêmes mesures que Dialog", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    const dialog = screen.getByRole("alertdialog", { name: "Supprimer le projet ?" });
    expect(dialog).toHaveAccessibleDescription("Cette action est définitive.");
    expect(dialog).toHaveClass("max-w-[520px]", "rounded-dialog", "shadow-dialog");
  });

  it("focus initial sur Annuler", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(screen.getByRole("button", { name: "Annuler" })).toHaveFocus();
  });

  it("le voile ne ferme pas, Échap ferme et rend le focus", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const trigger = screen.getByRole("button", { name: "Supprimer" });
    await user.click(trigger);
    await user.click(document.querySelector("[data-slot='dialog-overlay']") as HTMLElement);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("l'action appelle son rappel puis ferme ; Annuler est outline, l'action destructive", async () => {
    const user = userEvent.setup();
    let calls = 0;
    render(<Demo onConfirm={() => (calls += 1)} />);
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(screen.getByRole("button", { name: "Annuler" })).toHaveClass("border-input");
    await user.click(screen.getAllByRole("button", { name: "Supprimer" })[0] as HTMLElement);
    expect(calls).toBe(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
