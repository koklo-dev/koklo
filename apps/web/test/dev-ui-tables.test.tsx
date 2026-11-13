import { ToastProvider } from "@koklo/ui";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { polyfillRadix } from "./support/web-mocks.ts";

/** TK-139 lot C : section « Onglets et tableaux · C » de la galerie `/dev/ui` (S-dev-ui). */
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

const section = () => screen.getByRole("region", { name: /Onglets et tableaux · C/ });

describe("galerie : section « Onglets et tableaux · C » (S-dev-ui)", () => {
  it("h2 dans la section dev-ui-surf-c, puis un h3 par cadre", () => {
    expect(section()).toHaveAttribute("aria-labelledby", "dev-ui-surf-c");
    expect(within(section()).getAllByRole("heading", { level: 3 }).length).toBe(4);
  });

  it("onglets en lien, tablist, tableau encadré et matrice Oui / Non", () => {
    const s = within(section());
    expect(s.getByRole("link", { name: /Vue d'ensemble/ })).toHaveAttribute("aria-current", "page");
    expect(s.getAllByRole("tablist").length).toBe(3);
    expect(s.getAllByRole("tab").length).toBe(8);
    expect(s.getByRole("table", { name: "Membres de l'organisation" })).toBeInTheDocument();
    expect(s.getAllByRole("img", { name: "Oui" }).length).toBe(6);
    expect(s.getAllByRole("img", { name: "Non" }).length).toBe(3);
  });
});
