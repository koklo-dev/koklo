import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DevUiShell } from "../src/components/dev-ui-shell.tsx";
import { polyfillRadix } from "./support/web-mocks.ts";

/** TK-88 lot B : section « Coquille » de la galerie /dev/ui (fiche S-dev-ui). */
beforeEach(() => polyfillRadix());

describe("galerie /dev/ui : section Coquille", () => {
  it("région nommée « Coquille » avec le groupe SPEC, l'en-tête de projet et la palette", () => {
    render(<DevUiShell />);
    const region = screen.getByRole("region", { name: "Coquille" });
    expect(within(region).getAllByRole("group", { name: "Spec" })).toHaveLength(2);
    expect(
      within(region).getByRole("heading", { level: 4, name: "Cahier fonctionnel" }),
    ).toBeVisible();
    expect(within(region).getByRole("navigation", { name: "Emplacement" })).toBeVisible();
    expect(
      within(region).getAllByRole("button", { name: "Données, disponible après le fonctionnel" }),
    ).toHaveLength(2);
  });

  it("le rail replié porte des aria-label sur ses icônes", () => {
    render(<DevUiShell />);
    expect(screen.getAllByRole("link", { name: "Spec · Fonctionnel" })).toHaveLength(1);
  });

  it("la palette s'ouvre depuis le bouton de la galerie", async () => {
    render(<DevUiShell />);
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir la palette" }));
    expect(screen.getByRole("dialog", { name: "Recherche" })).toBeVisible();
    expect(screen.getByRole("option", { name: /Corriger la facture/ })).toBeVisible();
  });
});
