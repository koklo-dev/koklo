import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ProjectsRoute from "../src/app/(shell)/projects/page.tsx";
import RootLayout, { metadata } from "../src/app/layout.tsx";
import LoginPage from "../src/app/login/page.tsx";
import { THEME_INIT_SCRIPT } from "../src/lib/theme.ts";

const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
);
const singleClientProjectPath = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/projects",
  redirect,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "sid=abc" }) }));
vi.mock("../src/lib/runtime-config.ts", () => ({
  readRuntimeConfig: () => ({ apiUrl: "http://api.internal:3001" }),
}));
vi.mock("../src/lib/single-client-project.ts", () => ({ singleClientProjectPath }));
vi.mock("../src/components/projects-page.tsx", () => ({
  ProjectsPage: () => <p>liste</p>,
}));
vi.mock("../src/components/login-form.tsx", () => ({ LoginForm: () => <p>carte</p> }));

describe("RootLayout", () => {
  it("déclare la langue fr et le script de thème avant le contenu", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>contenu</p>
      </RootLayout>,
    );
    expect(html).toContain('lang="fr"');
    expect(html).toContain(THEME_INIT_SCRIPT.slice(0, 40));
    expect(html.indexOf("<script")).toBeLessThan(html.indexOf("contenu"));
    expect(metadata.title).toBe("Koklo");
  });
});

describe("page /login", () => {
  it("compose la carte de connexion et la bascule de thème", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("login-page")).toHaveTextContent("carte");
    expect(screen.getByRole("button", { name: /mode|thème/i })).toBeInTheDocument();
  });
});

describe("page /projects", () => {
  const route = async (params: Record<string, string> = {}) =>
    ProjectsRoute({ searchParams: Promise.resolve(params) });

  it("rend la vue projets (le titre h1 et la coquille vivent dans la vue et le layout du groupe (shell))", async () => {
    render(await route());
    expect(screen.getByText("liste")).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("client à un seul projet : redirige côté serveur vers ce projet", async () => {
    singleClientProjectPath.mockResolvedValueOnce("/projects/p1");
    await expect(route()).rejects.toThrow("NEXT_REDIRECT /projects/p1");
    expect(singleClientProjectPath).toHaveBeenCalledWith(expect.any(String), "sid=abc");
  });

  it("recherche ou filtre dans l'adresse : jamais de redirection", async () => {
    singleClientProjectPath.mockClear();
    singleClientProjectPath.mockResolvedValue("/projects/p1");
    render(await route({ phase: "idea" }));
    render(await route({ q: "alpha" }));
    expect(singleClientProjectPath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
