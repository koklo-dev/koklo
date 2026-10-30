import { SidebarProvider } from "@koklo/ui";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KanbanLayout from "../src/app/kanban/layout.tsx";
import KanbanRoute, { metadata } from "../src/app/kanban/page.tsx";
import { AppSidebar } from "../src/components/app-sidebar.tsx";
import { renderWithQuery } from "./support/render.tsx";
import { pathname, polyfillRadix, resetWebMocks } from "./support/web-mocks.ts";
import { DESKTOP, setViewport } from "./viewport.ts";

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
vi.mock("../src/components/kanban-page.tsx", () => ({
  KanbanPage: () => <p>tableau</p>,
}));

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setViewport(DESKTOP);
});

describe("C8 — navigation vers /kanban", () => {
  const renderSidebar = (path: string) => {
    pathname.current = path;
    return renderWithQuery(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );
  };

  it("la barre latérale propose « Kanban » vers /kanban", async () => {
    renderSidebar("/projects");
    expect(await screen.findByRole("link", { name: "Kanban" })).toHaveAttribute("href", "/kanban");
  });

  it("« Kanban » est aria-current=page sur /kanban, pas « Projets »", async () => {
    renderSidebar("/kanban");
    expect(await screen.findByRole("link", { name: "Kanban" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Projets" })).not.toHaveAttribute("aria-current");
  });

  it("« Kanban » n'est pas courant sur /projects", async () => {
    renderSidebar("/projects");
    expect(await screen.findByRole("link", { name: "Kanban" })).not.toHaveAttribute("aria-current");
  });
});

describe("C8 — route /kanban", () => {
  it("métadonnées « Kanban · Koklo »", () => {
    expect(metadata.title).toBe("Kanban · Koklo");
  });

  it("la page rend le h1 « Kanban » et le tableau", () => {
    render(<KanbanRoute />);
    expect(screen.getByRole("heading", { level: 1, name: "Kanban" })).toBeInTheDocument();
    expect(screen.getByText("tableau")).toBeInTheDocument();
  });

  it("le layout est le gabarit AppFrame : fil d'Ariane « Koklo > Kanban » et entrée active", async () => {
    pathname.current = "/kanban";
    renderWithQuery(
      <KanbanLayout>
        <h1>Kanban</h1>
      </KanbanLayout>,
    );
    const crumbs = await screen.findByRole("navigation", { name: /breadcrumb|fil d'ariane/i });
    expect(within(crumbs).getByText("Kanban")).toHaveAttribute("aria-current", "page");
    // Le fil d'Ariane (BreadcrumbPage) a lui aussi le rôle link : on cible le lien de la barre latérale.
    const links = await screen.findAllByRole("link", { name: "Kanban" });
    const sidebarLink = links.find((link) => link.getAttribute("href") === "/kanban");
    expect(sidebarLink).toHaveAttribute("aria-current", "page");
  });
});
