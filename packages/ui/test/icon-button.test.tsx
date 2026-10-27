// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Button,
  IconButton,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "../src/index.ts";
import { expectAccessibleName } from "./helpers/a11y.ts";

describe("CA2 : un bouton d'icône sans aria-label échoue", () => {
  it("le type exige aria-label sur IconButton", () => {
    // @ts-expect-error aria-label obligatoire
    render(<IconButton icon="close" />);
  });

  it("le type exige un nom sur Button size=icon", () => {
    // @ts-expect-error size=icon sans aria-label ni aria-labelledby
    render(<Button size="icon">x</Button>);
  });

  it("le contrôle d'accessibilité échoue pour un bouton d'icône sans nom", () => {
    // @ts-expect-error volontairement sans aria-label pour prouver l'échec
    render(<IconButton icon="close" />);
    expect(() => expectAccessibleName(screen.getByRole("button"))).toThrow(/nom accessible/);
  });

  it("avec aria-label : nom accessible et Icon interne aria-hidden", () => {
    render(<IconButton icon="close" aria-label="Fermer" />);
    const button = screen.getByRole("button", { name: "Fermer" });
    expect(() => expectAccessibleName(button)).not.toThrow();
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("les boutons internes (fermeture de Sheet) ont un nom accessible", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Titre</SheetTitle>
          <SheetDescription>Détail</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(() => expectAccessibleName(b)).not.toThrow();
  });
});
