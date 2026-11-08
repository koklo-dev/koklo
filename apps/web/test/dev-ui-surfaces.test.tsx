import { ToastProvider } from "@koklo/ui";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { polyfillRadix } from "./support/web-mocks.ts";

/**
 * TK-139 lot A : section « Surfaces · A » de la galerie `/dev/ui` (S-dev-ui) : cartes, retours d état,
 * squelettes. Données fictives, aucun nom de fournisseur d'IA.
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

const section = () => screen.getByRole("region", { name: /Surfaces · A/ });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("galerie : section « Surfaces · A » (S-dev-ui)", () => {
  it("h2 dans la section dev-ui-surf-a, puis un h3 par cadre", () => {
    expect(section()).toHaveAttribute("aria-labelledby", "dev-ui-surf-a");
    for (const name of [
      "Card",
      "StatCard",
      "ProgressBar",
      "InlineAlert",
      "EmptyState",
      "Skeleton et SkeletonRow",
      "Alert (déprécié)",
    ]) {
      expect(within(section()).getByRole("heading", { level: 3, name })).toBeVisible();
    }
  });

  it("six variantes de carte, quatre StatCard dont une jauge nommée", () => {
    const root = section();
    for (const variant of ["panel", "inset", "interactive", "proposal", "dashed", "warning"]) {
      expect(root.querySelector(`[data-slot='card'][data-variant='${variant}']`)).not.toBeNull();
    }
    expect(root.querySelectorAll("[data-slot='stat-card']")).toHaveLength(4);
    expect(
      within(root).getByRole("progressbar", { name: "Part du plafond mensuel consommée" }),
    ).toHaveAttribute("aria-valuenow", "38");
  });

  it("jauges ProgressBar aux deux tailles, chacune nommée", () => {
    const bars = within(section()).getAllByRole("progressbar");
    expect(bars.length).toBeGreaterThanOrEqual(7);
    for (const bar of bars) expect(bar).toHaveAccessibleName();
  });

  it("InlineAlert : cinq tons, actions en boutons, « Détails » déplie", async () => {
    const root = section();
    for (const tone of ["neutral", "success", "agent", "warning", "error"]) {
      expect(
        root.querySelector(`[data-slot='inline-alert'][data-variant='${tone}']`),
        tone,
      ).not.toBeNull();
    }
    expect(within(root).getByRole("button", { name: "Revoir" })).toBeVisible();
    expect(within(root).getByRole("button", { name: "Plus tard" })).toBeVisible();
    await userEvent.click(within(root).getByRole("button", { name: "Détails" }));
    expect(within(root).getByText("Ne saisissez pas de données personnelles.")).toBeVisible();
  });

  it("EmptyState encadré avec deux actions, puis en ligne sans tuile", () => {
    const root = section();
    expect(within(root).getByRole("button", { name: "Créer un projet" })).toBeVisible();
    expect(within(root).getByRole("button", { name: "Importer un texte" })).toBeVisible();
    const inline = root.querySelector("[data-slot='empty-state'][data-variant='inline']");
    expect(inline).not.toBeNull();
    expect(inline?.querySelector("[data-slot='icon-tile']")).toBeNull();
  });

  it("quatre SkeletonRow masquées, Alert déprécié étiqueté", () => {
    const root = section();
    const rows = root.querySelectorAll("[data-slot='skeleton-row']");
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toHaveAttribute("aria-hidden", "true");
    expect(within(root).getByText(/Déprécié/)).toBeVisible();
  });

  it("aucun nom de fournisseur d'IA", () => {
    expect(section().textContent).not.toMatch(/anthropic|openai|mistral|gemini/i);
  });
});
