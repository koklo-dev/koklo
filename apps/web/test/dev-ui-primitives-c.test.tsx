import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { polyfillRadix } from "./support/web-mocks.ts";

/** TK-138 lot C : section « Primitives C » de la galerie `/dev/ui` (S-dev-ui). Données fictives. */
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dev/ui",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(async () => {
  polyfillRadix();
  localStorage.clear();
  vi.stubEnv("API_INTERNAL_URL", "http://127.0.0.1:3101");
  vi.stubEnv("APP_VERSION", "0.0.0-test");
  vi.stubEnv("APP_ENV", "test");
  const { default: Page } = await import("../src/app/dev/ui/page.tsx");
  render((await (Page as () => ReactElement | Promise<ReactElement>)()) as ReactElement);
});
afterEach(() => vi.unstubAllEnvs());

const section = () => screen.getByRole("region", { name: /Primitives de base · C/ });
const frame = (name: string) =>
  within(section()).getByRole("heading", { level: 3, name }).parentElement as HTMLElement;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("galerie : section « Primitives C » (S-dev-ui)", () => {
  it("h2 dans la section dev-ui-prim-c, puis un h3 par cadre", () => {
    expect(section()).toHaveAttribute("aria-labelledby", "dev-ui-prim-c");
    for (const name of [
      "Pastilles de filtre et options",
      "Contrôle segmenté",
      "Interrupteurs, cases et radios",
      "Cartes à choix",
      "Champs de saisie",
      "Champs avec libellé",
    ]) {
      expect(within(section()).getByRole("heading", { level: 3, name })).toBeVisible();
    }
  });

  it("filtres : actif, compteur, ajout ; options : une seule sélectionnée", async () => {
    const f = frame("Pastilles de filtre et options");
    expect(within(f).getByRole("button", { name: "À valider" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(f).getByRole("button", { name: /Ouverts.*12/ })).toBeVisible();
    expect(within(f).getByRole("button", { name: "Ajouter un filtre" })).toBeVisible();
    await userEvent.click(within(f).getByRole("option", { name: "modele-2" }));
    expect(within(f).getAllByRole("option", { selected: true })).toHaveLength(1);
  });

  it("segmenté : trois variantes nommées, un actif chacun", () => {
    const f = frame("Contrôle segmenté");
    expect(within(f).getByRole("group", { name: "Apparence d'exemple" })).toBeVisible();
    expect(within(f).getByRole("radiogroup", { name: "Affichage d'exemple" })).toBeVisible();
    expect(within(f).getByRole("group", { name: "Lignes par page d'exemple" })).toBeVisible();
  });

  it("interrupteurs, cases (dont indéterminée) et radios", () => {
    const f = frame("Interrupteurs, cases et radios");
    expect(within(f).getByRole("switch", { name: "Fournisseur de secours" })).toBeChecked();
    expect(within(f).getByRole("switch", { name: "Verrouillé" })).toBeDisabled();
    expect(within(f).getByRole("checkbox", { name: "Case indéterminée" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    );
    expect(within(f).getByRole("radio", { name: "Tous les jours" })).toBeChecked();
  });

  it("cartes à choix : une choisie, une désactivée, jamais le nom du fournisseur d'IA", () => {
    const f = frame("Cartes à choix");
    expect(within(f).getByRole("radio", { name: /Fournisseur A/ })).toBeChecked();
    expect(within(f).getByRole("radio", { name: /Fournisseur C/ })).toBeDisabled();
    expect(section().textContent).not.toMatch(/anthropic|claude|openai/i);
  });

  it("champs : 40, 36, mono, invalide, désactivé pointillé, recherche avec effacement", () => {
    const f = frame("Champs de saisie");
    expect(within(f).getByRole("textbox", { name: "Plafond mensuel" })).toHaveClass("h-10");
    expect(within(f).getByRole("textbox", { name: "Plafond compact" })).toHaveClass("h-9");
    expect(within(f).getByRole("textbox", { name: "Clé d'exemple" })).toHaveClass("font-mono");
    expect(within(f).getByRole("textbox", { name: "Champ invalide" })).toBeInvalid();
    expect(within(f).getByRole("textbox", { name: "Champ désactivé" })).toBeDisabled();
    expect(
      within(f).getByRole("searchbox", { name: "Rechercher une fonctionnalité" }),
    ).toBeVisible();
    expect(within(f).getByRole("button", { name: "Effacer" })).toBeVisible();
  });

  it("champs avec libellé : obligatoire, facultatif, erreur annoncée, liste", () => {
    const f = frame("Champs avec libellé");
    expect(within(f).getAllByText("obligatoire").length).toBeGreaterThanOrEqual(2);
    expect(within(f).getByText("(facultatif)")).toBeVisible();
    expect(within(f).getByRole("alert")).toHaveTextContent("Saisir un montant positif");
    expect(within(f).getByRole("combobox", { name: /Rôle/ })).toHaveClass("h-10");
    expect(within(f).getByRole("combobox", { name: "Liste désactivée" })).toBeDisabled();
  });
});
