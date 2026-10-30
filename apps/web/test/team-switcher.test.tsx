import { SidebarProvider } from "@koklo/ui";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "../src/components/app-sidebar.tsx";
import { TeamSwitcher } from "../src/components/team-switcher.tsx";
import { renderWithQuery } from "./support/render.tsx";
import { findNamed } from "./support/wait.ts";
import {
  getSession,
  navigations,
  ORG_ID,
  OTHER_ORG_ID,
  organization,
  pathname,
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

const renderSwitcher = () =>
  renderWithQuery(
    <SidebarProvider>
      <TeamSwitcher />
    </SidebarProvider>,
  );

/**
 * Attend que la liste d'organisations ET la session soient chargées (le déclencheur passe de « Koklo » à
 * l'organisation active), puis ouvre le menu. L'attente porte sur une requête de texte, peu coûteuse :
 * un `findByRole(..., { name })` sondé en boucle recalcule les noms accessibles à chaque mutation du DOM
 * et, sur un CPU saturé, monopolise le fil d'exécution au point d'empêcher les timers de React Query
 * de livrer les données avant l'échéance.
 */
async function openSwitcher() {
  await screen.findByText("Atelier Lumière");
  await userEvent.click(screen.getByRole("button", { name: /Atelier Lumière/ }));
}

describe("TeamSwitcher réel (S-projects v4)", () => {
  it("affiche « Koklo » pendant le chargement puis le nom et le rôle de l'organisation active", async () => {
    renderSwitcher();
    expect(screen.getByText("Koklo")).toBeInTheDocument();
    expect(await screen.findByText("Atelier Lumière")).toBeInTheDocument();
    expect(screen.getByText("Propriétaire")).toBeInTheDocument();
  });

  it("ouvre un menu « Organisations » avec l'active cochée, les autres, et « Créer une organisation »", async () => {
    renderSwitcher();
    await openSwitcher();
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Organisations")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Atelier Lumière/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Studio Nord/ })).toBeInTheDocument();
    const create = within(menu).getByRole("menuitem", { name: "Créer une organisation" });
    await userEvent.click(create);
    await waitFor(() =>
      expect(
        navigations().includes("/organizations") ||
          screen.queryByRole("link", { name: "Créer une organisation" }) !== null,
      ).toBe(true),
    );
  });

  it("choisir une autre organisation appelle setActive", async () => {
    renderSwitcher();
    await openSwitcher();
    await userEvent.click(await findNamed("menuitem", /Studio Nord/));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ organizationId: OTHER_ORG_ID }));
  });
});

describe("Navigation de la barre latérale", () => {
  const renderSidebar = (path: string) => {
    pathname.current = path;
    return renderWithQuery(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );
  };

  it("propose « Projets » et « Membres » vers /projects et /members", async () => {
    renderSidebar("/projects");
    expect(await findNamed("link", "Projets")).toHaveAttribute("href", "/projects");
    expect(await findNamed("link", "Membres")).toHaveAttribute("href", "/members");
  });

  it("marque « Membres » aria-current=page sur /members, pas « Projets »", async () => {
    renderSidebar("/members");
    expect(await findNamed("link", "Membres")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Projets" })).not.toHaveAttribute("aria-current");
  });
});
