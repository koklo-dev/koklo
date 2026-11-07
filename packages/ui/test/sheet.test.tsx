// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../src/index.ts";

/** TK-139 lot B, cas 12 (fiche §3) : `Sheet` 440 / 540 / 620. */
function Demo({ size }: { size?: "detail" | "form" | "wide" }) {
  return (
    <Sheet>
      <SheetTrigger>Ouvrir</SheetTrigger>
      <SheetContent size={size}>
        <SheetHeader icon="edit" tag="TK-139">
          <SheetTitle>Détail</SheetTitle>
          <SheetDescription>Sous-titre du tiroir</SheetDescription>
        </SheetHeader>
        <input aria-label="Champ" />
        <SheetFooter>
          <SheetClose>Annuler</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Ouvrir" }));

describe("Sheet", () => {
  it.each([
    [undefined, "sm:max-w-[440px]"],
    ["detail", "sm:max-w-[440px]"],
    ["form", "sm:max-w-[540px]"],
    ["wide", "sm:max-w-[620px]"],
  ] as const)("taille %s : %s, pleine largeur sous 640", async (size, cls) => {
    const user = userEvent.setup();
    render(<Demo size={size} />);
    await open(user);
    expect(screen.getByRole("dialog")).toHaveClass(cls, "w-full");
  });

  it("ombre --shadow-sheet, voile --overlay, titre text-dialog-title", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await open(user);
    expect(screen.getByRole("dialog")).toHaveClass("shadow-sheet", "bg-raised");
    expect(document.querySelector("[data-slot='sheet-overlay']")).toHaveClass("bg-overlay");
    expect(screen.getByRole("heading", { name: "Détail" })).toHaveClass("text-dialog-title");
  });

  it("titre et description liés ; en-tête avec tuile décorative et identifiant", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await open(user);
    const dialog = screen.getByRole("dialog", { name: "Détail" });
    expect(dialog).toHaveAccessibleDescription("Sous-titre du tiroir");
    expect(dialog.querySelector("[data-slot='icon-tile']")).toHaveAttribute("data-size", "36");
    expect(screen.getByText("TK-139")).toHaveAttribute("data-slot", "id-tag");
  });

  it("pied --surface avec bordure haute", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await open(user);
    expect(screen.getByRole("button", { name: "Annuler" }).parentElement).toHaveClass(
      "bg-surface",
      "border-t",
    );
  });

  it("Échap ferme et rend le focus ; Tab reste piégé", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const trigger = screen.getByRole("button", { name: "Ouvrir" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
