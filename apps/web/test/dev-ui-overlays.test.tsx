import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { polyfillRadix } from "./support/web-mocks.ts";

/**
 * TK-139 lot B : section « Superpositions · B » de la galerie `/dev/ui` (S-dev-ui) : dialogues, tiroirs,
 * toasts ouverts par bouton. Données fictives, aucun nom de fournisseur d'IA.
 */
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

const section = () => screen.getByRole("region", { name: /Superpositions · B/ });

describe("galerie : section « Superpositions · B » (S-dev-ui)", () => {
  it("h2 dans la section dev-ui-surf-b, puis un h3 par cadre", () => {
    expect(section()).toHaveAttribute("aria-labelledby", "dev-ui-surf-b");
    for (const name of ["Dialog", "AlertDialog", "Sheet", "Toast"]) {
      expect(within(section()).getByRole("heading", { level: 3, name })).toBeVisible();
    }
  });

  it("le dialogue « Nouveau projet » s'ouvre et se ferme, focus rendu au bouton", async () => {
    const user = userEvent.setup();
    const trigger = within(section()).getByRole("button", { name: "Ouvrir le dialogue" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Nouveau projet" });
    expect(dialog).toHaveAccessibleDescription(/dossier d'idée/);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("le dialogue d'alerte a le focus sur Annuler", async () => {
    const user = userEvent.setup();
    await user.click(
      within(section()).getByRole("button", { name: "Ouvrir le dialogue d'alerte" }),
    );
    expect(screen.getByRole("alertdialog", { name: "Supprimer le projet ?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Annuler" })).toHaveFocus();
  });

  it.each([
    ["Tiroir 440", "sm:max-w-[440px]"],
    ["Tiroir 540", "sm:max-w-[540px]"],
    ["Tiroir 620", "sm:max-w-[620px]"],
  ])("%s ouvre un tiroir de la bonne taille", async (name, cls) => {
    const user = userEvent.setup();
    await user.click(within(section()).getByRole("button", { name }));
    expect(screen.getByRole("dialog", { name: "Plafond mensuel" })).toHaveClass(cls);
  });

  it("trois boutons lancent un toast chacun, dans la région Notifications (F8)", async () => {
    const user = userEvent.setup();
    for (const name of ["Toast de succès", "Toast d'erreur", "Toast d'information"]) {
      await user.click(within(section()).getByRole("button", { name }));
    }
    const titles = Array.from(document.querySelectorAll("[data-slot='toast-title']")).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(["Projet créé", "L'envoi a échoué", "Synchronisation en cours"]);
    expect(screen.getByRole("region", { name: "Notifications (F8)" })).toBeInTheDocument();
  });

  it("aucun nom de fournisseur d'IA", () => {
    expect(document.body.textContent).not.toMatch(/Anthropic|OpenAI|Claude/);
  });
});
