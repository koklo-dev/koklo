// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../src/index.ts";

/** TK-139 lot B, cas 10 (fiche §3, DESIGN.md §5.6) : `Dialog`. */
function Demo({ icon = false }: { icon?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger>Ouvrir</DialogTrigger>
      <DialogContent>
        <DialogHeader icon={icon ? "add" : undefined}>
          <DialogTitle>Nouveau projet</DialogTitle>
          <DialogDescription>Donnez un nom au projet.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <input aria-label="Nom" />
        </DialogBody>
        <DialogFooter>
          <DialogClose>Annuler</DialogClose>
          <button type="button">Créer</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Dialog", () => {
  it("role dialog, titre et description reliés", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    const dialog = screen.getByRole("dialog", { name: "Nouveau projet" });
    expect(dialog).toHaveAccessibleDescription("Donnez un nom au projet.");
  });

  it("520 au plus, rayon 14, fond --raised, ombre --shadow-dialog", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass(
      "max-w-[520px]",
      "w-[calc(100%-32px)]",
      "rounded-dialog",
      "bg-raised",
      "shadow-dialog",
    );
    expect(screen.getByRole("heading", { name: "Nouveau projet" })).toHaveClass(
      "text-dialog-title",
    );
  });

  it("voile --overlay, flou et animations sous motion-safe seulement", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    const overlay = document.querySelector("[data-slot='dialog-overlay']") as HTMLElement;
    expect(overlay).toHaveClass("bg-overlay", "motion-safe:backdrop-blur-[6px]");
    for (const el of [overlay, screen.getByRole("dialog")]) {
      expect(el.className).not.toMatch(/(^|\s)(animate-|backdrop-blur)/);
      expect(el.className).toMatch(/motion-safe:animate-/);
    }
  });

  it("pied --surface avec bordure haute", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(screen.getByRole("button", { name: "Créer" }).parentElement).toHaveClass(
      "bg-surface",
      "border-t",
    );
  });

  it("icône d'en-tête facultative et décorative", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(document.querySelector("[data-slot='icon-tile']")).toBeNull();
    unmount();
    render(<Demo icon />);
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    const tile = document.querySelector("[data-slot='icon-tile']");
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile).toHaveAttribute("data-size", "36");
    expect(tile).toHaveAttribute("data-tone", "primary");
  });

  it("Échap ferme et rend le focus au déclencheur", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const trigger = screen.getByRole("button", { name: "Ouvrir" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("clic sur le voile ferme", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    await user.click(document.querySelector("[data-slot='dialog-overlay']") as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("le bouton Fermer nommé ferme", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("piège le focus : Tab boucle dans le dialogue", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole("button", { name: "Ouvrir" }));
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });
});
