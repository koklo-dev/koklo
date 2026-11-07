import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarOrganization } from "../src/components/sidebar-organization.tsx";
import { renderWithQuery } from "./support/render.tsx";
import { findNamed } from "./support/wait.ts";
import {
  getSession,
  navigations,
  ORG_ID,
  OTHER_ORG_ID,
  organization,
  polyfillRadix,
  procedures,
  resetWebMocks,
  sessionWith,
  setActive,
} from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return { useRouter: () => m.router, usePathname: () => m.pathname.current };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

const ORGS = [
  organization(),
  organization({ id: OTHER_ORG_ID, name: "Studio Nord", slug: "studio-nord", role: "dev" }),
];

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  getSession.mockResolvedValue(sessionWith(ORG_ID));
  procedures.organizationList.mockResolvedValue(ORGS);
});

/**
 * Attend que la liste d'organisations ET la session soient chargées (le déclencheur passe de « Koklo » à
 * l'organisation active), puis ouvre le menu. L'attente porte sur une requête de texte, peu coûteuse.
 */
async function openSwitcher() {
  await screen.findByText("Atelier Lumière");
  await userEvent.click(screen.getByRole("button", { name: /Atelier Lumière/ }));
}

describe("sélecteur d'organisation de la barre (S-app-shell §3)", () => {
  it("affiche « Koklo » pendant le chargement puis le nom et « Organisation · rôle »", async () => {
    renderWithQuery(<SidebarOrganization />);
    expect(screen.getByText("Koklo")).toBeInTheDocument();
    expect(await screen.findByText("Atelier Lumière")).toBeInTheDocument();
    expect(screen.getByText("Organisation · Propriétaire")).toBeInTheDocument();
  });

  it("la tuile porte les initiales de l'organisation, masquées aux lecteurs d'écran", async () => {
    renderWithQuery(<SidebarOrganization />);
    const tile = (await screen.findByText("AL")).closest("span");
    expect(tile).toHaveAttribute("aria-hidden", "true");
  });

  it("ouvre un menu « Organisations » avec l'active cochée, les autres, et « Créer une organisation »", async () => {
    renderWithQuery(<SidebarOrganization />);
    await openSwitcher();
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Organisations")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Atelier Lumière/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Studio Nord/ })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Créer une organisation" }));
    await waitFor(() => expect(navigations()).toContain("/organizations"));
  });

  it("choisir une autre organisation appelle setActive", async () => {
    renderWithQuery(<SidebarOrganization />);
    await openSwitcher();
    await userEvent.click(await findNamed("menuitem", /Studio Nord/));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ organizationId: OTHER_ORG_ID }));
  });
});
