import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout, { metadata } from "../src/app/layout.tsx";
import LoginPage from "../src/app/login/page.tsx";
import ProjectsRoute from "../src/app/projects/page.tsx";
import { THEME_INIT_SCRIPT } from "../src/lib/theme.ts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/projects",
}));
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
  it("rend le titre h1 et la vue projets (le gabarit sidebar vit dans le layout)", () => {
    render(<ProjectsRoute />);
    expect(screen.getByRole("heading", { level: 1, name: "Projets" })).toBeInTheDocument();
    expect(screen.getByText("liste")).toBeInTheDocument();
  });
});
