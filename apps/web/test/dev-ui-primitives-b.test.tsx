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

const section = () => screen.getByRole("region", { name: /Primitives de base · B/ });
const frame = (name: string) => {
  const h3 = within(section()).getByRole("heading", { level: 3, name });
  return h3.parentElement as HTMLElement;
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("galerie : section « Primitives B » (S-dev-ui)", () => {
  it("h2 dans la section dev-ui-prim-b, puis un h3 par cadre", () => {
    expect(section()).toHaveAttribute("aria-labelledby", "dev-ui-prim-b");
    for (const name of [
      "Pastilles",
      "Compteurs et repères",
      "Rôles et identifiants",
      "Statuts",
      "Avatars",
      "Tuiles d'icône",
    ]) {
      expect(within(section()).getByRole("heading", { level: 3, name })).toBeVisible();
    }
  });

  it("Pastilles : 3 tailles, 9 tons, interactive nommée", () => {
    const f = frame("Pastilles");
    for (const size of ["xs", "sm", "md"]) {
      expect(f.querySelector(`[data-size='${size}']`), size).not.toBeNull();
    }
    for (const tone of [
      "neutral",
      "soft",
      "outline",
      "dashed",
      "primary",
      "success",
      "warning",
      "danger",
      "muted",
    ]) {
      expect(f.querySelector(`[data-tone='${tone}']`), tone).not.toBeNull();
    }
    expect(within(f).getByRole("button", { name: /Tous les rôles/ })).toBeVisible();
  });

  it("Compteurs et repères : CountBadge de 5 tons et Dot nommé", () => {
    const f = frame("Compteurs et repères");
    expect(f.querySelectorAll("[data-slot='count-badge']").length).toBeGreaterThanOrEqual(5);
    expect(within(f).getByRole("img", { name: /\S/ })).toBeVisible();
  });

  it("Rôles et identifiants : six rôles, IdTag soft, outline, sm, pill", () => {
    const f = frame("Rôles et identifiants");
    for (const label of [
      "Propriétaire",
      "Administrateur",
      "Développeur",
      "Designer",
      "Business",
      "Client",
    ]) {
      expect(within(f).getAllByText(label)[0], label).toBeVisible();
    }
    // TK-141 : `RolePill icon` (en-tête de Réglages)
    expect(f.querySelector("[data-role='owner'] svg[data-icon='badge']")).not.toBeNull();
    expect(f.querySelector("[data-role='client'] svg[data-icon='person']")).not.toBeNull();
    expect(f.querySelectorAll("[data-slot='id-tag']").length).toBeGreaterThanOrEqual(4);
    expect(f.querySelector("[data-slot='id-tag'].rounded-full")).not.toBeNull();
  });

  it("Statuts : validation, livrable et cycle de vie au gabarit Pill md", () => {
    const f = frame("Statuts");
    expect(f.querySelectorAll("[data-slot='validation-status']").length).toBeGreaterThanOrEqual(4);
    expect(f.querySelectorAll("[data-slot='deliverable-status']").length).toBeGreaterThanOrEqual(4);
    expect(f.querySelectorAll("[data-slot='lifecycle-status']").length).toBeGreaterThanOrEqual(2);
  });

  it("Avatars : 6 tailles, 4 tons, 2 formes, sans nom de fournisseur", () => {
    const f = frame("Avatars");
    for (const size of [24, 28, 32, 36, 40, 56]) {
      expect(f.querySelector(`[data-size='${size}']`), String(size)).not.toBeNull();
    }
    for (const tone of ["muted", "soft", "warning", "agent"]) {
      expect(f.querySelector(`[data-tone='${tone}']`), tone).not.toBeNull();
    }
    expect(f.querySelector("[data-shape='tile']")).not.toBeNull();
    expect(f.querySelector("[data-shape='circle']")).not.toBeNull();
    expect(section().textContent).not.toMatch(/anthropic|claude|openai/i);
  });

  it("Tuiles d'icône : 5 tailles et 4 tons, décoratives", () => {
    const f = frame("Tuiles d'icône");
    for (const size of [28, 32, 36, 40, 48]) {
      expect(
        f.querySelector(`[data-slot='icon-tile'][data-size='${size}']`),
        String(size),
      ).not.toBeNull();
    }
    for (const tone of ["soft", "primary", "success", "warning"]) {
      expect(f.querySelector(`[data-slot='icon-tile'][data-tone='${tone}']`), tone).not.toBeNull();
    }
  });
});
