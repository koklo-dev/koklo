import { ToastProvider } from "@koklo/ui";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { polyfillRadix } from "./support/web-mocks.ts";

/**
 * TK-138 lot A : section « Primitives A » de la galerie `/dev/ui` (S-dev-ui) : boutons, boutons d'icône,
 * touches, indicateur de chargement et icônes. Données fictives, aucun nom de fournisseur d'IA.
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
  render(
    <ToastProvider>
      {(await (Page as () => ReactElement | Promise<ReactElement>)()) as ReactElement}
    </ToastProvider>,
  );
});
afterEach(() => vi.unstubAllEnvs());

const section = () => screen.getByRole("region", { name: /Primitives de base · A/ });
const frame = (name: string) => {
  const h3 = within(section()).getByRole("heading", { level: 3, name });
  return h3.parentElement as HTMLElement;
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("galerie : section « Primitives A » (S-dev-ui)", () => {
  it("h2 « Primitives de base » dans la section dev-ui-prim-a, puis un h3 par cadre", () => {
    expect(section()).toHaveAttribute("aria-labelledby", "dev-ui-prim-a");
    expect(within(section()).getByRole("heading", { level: 2 }).textContent).toMatch(
      /Primitives de base/,
    );
    for (const name of ["Boutons", "Boutons d'icône", "Chargement et touches", "Icônes"]) {
      expect(within(section()).getByRole("heading", { level: 3, name })).toBeVisible();
    }
  });

  it("Boutons : les 4 tailles et les 8 variantes", () => {
    const f = frame("Boutons");
    for (const size of ["xs", "sm", "md", "lg"]) {
      expect(f.querySelector(`[data-gallery-size='${size}']`), size).not.toBeNull();
    }
    for (const variant of [
      "default",
      "secondary",
      "outline",
      "ghost",
      "destructive",
      "dashed",
      "inherit",
      "link",
    ]) {
      expect(f.querySelector(`[data-gallery-variant='${variant}']`), variant).not.toBeNull();
    }
  });

  it("Boutons : désactivé avec sa raison, chargement aria-busy, enfoncé aria-pressed, pleine largeur", () => {
    const f = frame("Boutons");
    const disabled = within(f).getByRole("button", { name: "Action indisponible" });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAccessibleDescription(/\S/);
    expect(f.querySelector("button[aria-busy='true']")).not.toBeNull();
    expect(f.querySelector("button[aria-pressed='true']")).not.toBeNull();
    expect(f.querySelector("button.w-full")).not.toBeNull();
  });

  it("Boutons d'icône : 32, 36 et envoi, tous nommés", () => {
    const f = frame("Boutons d'icône");
    const buttons = within(f).getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const b of buttons) expect(b).toHaveAccessibleName(/\S/);
    expect(f.querySelector(".size-8.rounded-md")).not.toBeNull();
    expect(f.querySelector(".size-9")).not.toBeNull();
    expect(f.querySelector(".size-8.rounded-lg.bg-primary")).not.toBeNull();
  });

  it("Chargement et touches : trois spinners et des kbd", () => {
    const f = frame("Chargement et touches");
    expect(f.querySelectorAll("[data-slot='spinner']").length).toBeGreaterThanOrEqual(3);
    expect(f.querySelectorAll("kbd").length).toBeGreaterThanOrEqual(2);
  });

  it("Icônes : tailles 14 à 28, quatre tons, wand_stars sans nom de fournisseur", () => {
    const f = frame("Icônes");
    for (const size of [14, 16, 18, 20, 22, 24, 28]) {
      expect(f.querySelector(`svg[width='${size}']`), String(size)).not.toBeNull();
    }
    for (const tone of [
      "text-muted-foreground",
      "text-primary",
      "text-status-validated-foreground",
      "text-destructive",
    ]) {
      expect(f.querySelector(`svg.${tone}`), tone).not.toBeNull();
    }
    expect(within(f).getByText("wand_stars")).toBeVisible();
    expect(section().textContent).not.toMatch(/anthropic|claude|openai/i);
  });
});
