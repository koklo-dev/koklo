import { SidebarProvider } from "@koklo/ui";
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavProjects } from "../src/components/nav-projects.tsx";
import { renderWithQuery } from "./support/render.tsx";
import { findNamed } from "./support/wait.ts";
import { pathname, polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

/** TK-48 / 48d : la barre latérale lie chaque projet à sa page, l'entrée du projet courant est « page courante ». */
const A = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const B = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02";

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  procedures.projectList.mockResolvedValue([
    { id: A, name: "Atelier Lumière" },
    { id: B, name: "Portail partenaires" },
  ]);
});

async function renderNav(path: string) {
  pathname.current = path;
  renderWithQuery(
    <SidebarProvider>
      <NavProjects />
    </SidebarProvider>,
  );
  return findNamed("link", /Atelier Lumière/);
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("NavProjects — liens (TK-48d)", () => {
  it("chaque projet est un vrai lien vers /projects/<id>/features", async () => {
    const first = await renderNav("/projects");
    expect(first.tagName).toBe("A");
    expect(first).toHaveAttribute("href", `/projects/${A}/features`);
    expect(screen.getByRole("link", { name: /Portail partenaires/ })).toHaveAttribute(
      "href",
      `/projects/${B}/features`,
    );
  });

  it("le groupe garde le libellé « Projets »", async () => {
    await renderNav("/projects");
    expect(screen.getByText("Projets")).toBeInTheDocument();
  });

  it("plus de curseur par défaut (cursor-default) : l'entrée est cliquable", async () => {
    const first = await renderNav("/projects");
    expect(first.className).not.toMatch(/cursor-default/);
    expect(first.closest("li")?.innerHTML).not.toMatch(/cursor-default/);
  });

  it("hors de la page d'un projet : aucune entrée en aria-current", async () => {
    await renderNav("/projects");
    for (const link of screen.getAllByRole("link"))
      expect(link).not.toHaveAttribute("aria-current");
  });

  it("sur /projects/<id>/features : seule l'entrée de CE projet porte aria-current=page", async () => {
    const current = await renderNav(`/projects/${A}/features`);
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Portail partenaires/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("l'entrée courante porte l'état actif de la barre latérale (icône pleine)", async () => {
    const current = await renderNav(`/projects/${A}/features`);
    expect(current).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: /Portail partenaires/ })).not.toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("l'autre projet devient courant quand on change de page", async () => {
    await renderNav(`/projects/${B}/features`);
    expect(screen.getByRole("link", { name: /Portail partenaires/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /Atelier Lumière/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("une sous-route inconnue (/projects/<id>/features/x) ne marque pas l'entrée comme courante", async () => {
    await renderNav(`/projects/${A}/features/x`);
    expect(screen.getByRole("link", { name: /Atelier Lumière/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("l'icône reste décorative", async () => {
    const link = await renderNav("/projects");
    expect(within(link).getByText("Atelier Lumière")).toBeInTheDocument();
    expect(link.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });
});
