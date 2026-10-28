import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsLayout from "../src/app/projects/layout.tsx";
import { NavMain } from "../src/components/nav-main.tsx";
import { DESKTOP, MOBILE, setViewport } from "./viewport.ts";

// Frontières externes uniquement : navigation Next, client Better Auth, client oRPC.
const signOut = vi.hoisted(() => vi.fn());
const listFn = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/projects",
}));
vi.mock("../src/lib/auth-client.ts", () => ({
  authClient: {
    signOut,
    signIn: { social: vi.fn() },
    useSession: () => ({
      data: { user: { id: "u1", name: "Awa Koné", email: "awa@example.com", image: null } },
      isPending: false,
    }),
  },
}));
vi.mock("../src/lib/orpc.ts", () => ({
  orpc: {
    project: { list: { queryOptions: () => ({ queryKey: ["project", "list"], queryFn: listFn }) } },
  },
}));

// jsdom n'implémente pas ces API utilisées par Radix (menus, tooltips).
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const PROJECTS = [
  { id: "p1", name: "Atelier Lumière" },
  { id: "p2", name: "Portail partenaires" },
];

function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProjectsLayout>
        <h1>Projets</h1>
      </ProjectsLayout>
    </QueryClientProvider>,
  );
}

const sidebar = () => document.querySelector('[data-slot="sidebar"]') as HTMLElement;
const groupCount = () => sidebar().querySelectorAll('[data-slot="sidebar-group"]').length;

beforeEach(() => {
  localStorage.clear();
  // biome-ignore lint/suspicious/noDocumentCookie: remise à zéro du cookie sidebar_state entre les tests
  document.cookie = "sidebar_state=; max-age=0";
  signOut.mockReset();
  listFn.mockReset();
  listFn.mockResolvedValue(PROJECTS);
  setViewport(DESKTOP);
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas du layout, un test par comportement
describe("cas 2 : layout /projects (sidebar-07)", () => {
  it("header : TeamSwitcher « Koklo » (entrée unique, sans « Ajouter une équipe »)", async () => {
    renderLayout();
    const header = sidebar().querySelector('[data-slot="sidebar-header"]') as HTMLElement;
    expect(header).toHaveTextContent("Koklo");
    expect(screen.queryByText(/ajouter une équipe/i)).toBeNull();
    for (const demo of ["Acme", "Playground", "Design Engineering", "shadcn"]) {
      expect(document.body).not.toHaveTextContent(demo);
    }
  });

  it("contient NavMain, NavProjects réel, NavUser en pied et SidebarRail", async () => {
    renderLayout();
    expect(await within(sidebar()).findByText("Atelier Lumière")).toBeInTheDocument();
    expect(within(sidebar()).getByText("Portail partenaires")).toBeInTheDocument();
    expect(sidebar().querySelector('[data-slot="sidebar-footer"]')).toHaveTextContent(
      "awa@example.com",
    );
    const rail = sidebar().querySelector('[data-sidebar="rail"]');
    expect(rail, "SidebarRail absent").not.toBeNull();
    expect(rail?.getAttribute("aria-label")).toBeTruthy();
  });

  it("les projets de NavProjects ne sont pas des liens (pas de page de détail)", async () => {
    renderLayout();
    await within(sidebar()).findByText("Atelier Lumière");
    expect(within(sidebar()).queryByRole("link", { name: /Atelier Lumière/ })).toBeNull();
  });

  it.each([
    ["vide", () => listFn.mockResolvedValue([])],
    ["en erreur", () => listFn.mockRejectedValue(new Error("boom"))],
    ["en chargement", () => listFn.mockReturnValue(new Promise(() => undefined))],
  ])("NavProjects est masqué quand la liste est %s", async (_label, arrange) => {
    arrange();
    const { unmount } = renderLayout();
    await waitFor(() => expect(listFn).toHaveBeenCalled());
    const hidden = groupCount();
    unmount();
    listFn.mockResolvedValue(PROJECTS);
    renderLayout();
    await within(sidebar()).findByText("Atelier Lumière");
    expect(groupCount()).toBe(hidden + 1);
  });

  it("en-tête : SidebarTrigger nommé, séparateur et fil d'Ariane « Koklo > Projets »", () => {
    renderLayout();
    const trigger = document.querySelector('[data-sidebar="trigger"]') as HTMLElement;
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAccessibleName(/barre latérale/i);
    const crumbs = screen.getByRole("navigation", { name: /breadcrumb|fil d'ariane/i });
    expect(crumbs).toHaveTextContent(/Koklo.*Projets/);
    expect(within(crumbs).getByText("Projets")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { name: "Projets" }),
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
});

describe("cas 3 : NavMain (Collapsible)", () => {
  const wrap = (ui: ReactNode) => ui;
  it("un item avec sous-éléments se déplie au clic (aria-expanded)", async () => {
    const { SidebarProvider } = await import("@koklo/ui");
    render(
      wrap(
        <SidebarProvider>
          <NavMain
            items={[
              {
                title: "Documentation",
                url: "#",
                items: [{ title: "Introduction", url: "/intro" }],
              },
            ]}
          />
        </SidebarProvider>,
      ),
    );
    const trigger = screen.getByRole("button", { name: /Documentation/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Introduction" })).toBeInTheDocument();
  });

  it("un item sans sous-élément est un lien aria-current=page quand il est actif", async () => {
    const { SidebarProvider } = await import("@koklo/ui");
    render(
      <SidebarProvider>
        <NavMain items={[{ title: "Projets", url: "/projects", isActive: true }]} />
      </SidebarProvider>,
    );
    expect(screen.getByRole("link", { name: "Projets" })).toHaveAttribute("aria-current", "page");
  });

  it("dans le layout, l'unique entrée réelle est le lien « Projets » actif", () => {
    renderLayout();
    const link = within(sidebar()).getByRole("link", { name: "Projets" });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveAttribute("href", "/projects");
  });
});

describe("cas 4 : NavUser", () => {
  it("affiche le nom et l'e-mail de la session", () => {
    renderLayout();
    const footer = sidebar().querySelector('[data-slot="sidebar-footer"]') as HTMLElement;
    expect(footer).toHaveTextContent("Awa Koné");
    expect(footer).toHaveTextContent("awa@example.com");
  });

  it("le menu propose le thème et « Se déconnecter », qui appelle signOut", async () => {
    renderLayout();
    await userEvent.click(screen.getByRole("button", { name: /Menu utilisateur/ }));
    expect(await screen.findByRole("menuitem", { name: /thème/i })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Se déconnecter" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe("cas 5 : repli en icônes et mobile", () => {
  it("replié : le lien garde son nom et un Tooltip apparaît au survol", async () => {
    renderLayout();
    await userEvent.click(document.querySelector('[data-sidebar="trigger"]') as HTMLElement);
    expect(sidebar()).toHaveAttribute("data-state", "collapsed");
    const link = within(sidebar()).getByRole("link", { name: "Projets" });
    await userEvent.hover(link);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Projets");
  });

  it("mobile : pas de sidebar dans le DOM, une Sheet (dialog) s'ouvre au trigger, Échap ferme", async () => {
    setViewport(MOBILE);
    renderLayout();
    expect(screen.queryByRole("dialog")).toBeNull();
    const trigger = document.querySelector('[data-sidebar="trigger"]') as HTMLElement;
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Projets" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
