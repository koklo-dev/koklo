import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderSecurity, serveSecurity } from "./support/security.tsx";
import { polyfillRadix, procedures, resetWebMocks, watchUrl } from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return {
    useRouter: () => m.router,
    usePathname: () => m.pathname.current,
    useSearchParams: m.useSearchParams,
  };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("onglet Données sensibles", () => {
  it("bandeau d'hébergement, sous-traitants et transferts « à préciser » ; phrase de règle", async () => {
    serveSecurity("owner");
    renderSecurity({ search: "tab=data" });
    const banner = await screen.findByRole("note");
    await waitFor(() => expect(banner).toHaveTextContent("Hébergement : Scaleway, Paris"));
    expect(banner).toHaveTextContent("sous-traitants : Brevo");
    expect(banner).toHaveTextContent("transferts hors de l'Union européenne : à préciser");
    expect(screen.getByText(/Chaque champ du modèle de données est classé/)).toBeVisible();
  });

  it("tableau : « À décider », ligne non classée, « Décider » ouvre la feuille sur la ligne", async () => {
    serveSecurity("owner");
    renderSecurity({ search: "tab=data" });
    const row = await screen.findByRole("row", { name: /journaux\.ip/ });
    expect(row).toHaveTextContent("Champ non classé");
    expect(row).toHaveTextContent("À décider");
    await userEvent
      .setup()
      .click(within(row).getByRole("button", { name: "Décider : journaux.ip" }));
    await waitFor(() => expect(window.location.search).toContain("data=journaux.ip"));
    expect(window.location.search).toContain("new=1");
    const sheet = await screen.findByRole("dialog", { name: "Nouvelle donnée" });
    expect(within(sheet).getByRole("textbox", { name: /^Champ/ })).toHaveValue("journaux.ip");
    await waitFor(() =>
      expect(within(sheet).getByRole("textbox", { name: /^Conservation/ })).toHaveFocus(),
    );
  });

  it("registre RGPD : téléchargement du Markdown", async () => {
    serveSecurity("owner");
    procedures.securityRegistryExport.mockResolvedValue({
      filename: "registre-rgpd-portail.md",
      markdown: "# Registre",
    });
    const create = vi.fn(() => "blob:registre");
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    renderSecurity({ search: "tab=data" });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Registre RGPD" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(create).toHaveBeenCalled();
    click.mockRestore();
  });

  it("designer : registre seul, aucune écriture", async () => {
    serveSecurity("designer");
    renderSecurity({ search: "tab=data" });
    await screen.findByRole("row", { name: /journaux\.ip/ });
    expect(screen.getByRole("button", { name: "Registre RGPD" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Classer une donnée" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Décider/ })).toBeNull();
  });

  it("vide : « Aucune donnée à classer » ; recherche absente sous 50 lignes", async () => {
    serveSecurity("owner", { data: [] });
    renderSecurity({ search: "tab=data" });
    expect(await screen.findByText("Aucune donnée à classer")).toBeVisible();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
});
