import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "../src/app/page.tsx";
import { AppShell } from "../src/components/app-shell.tsx";
import { Providers } from "../src/components/providers.tsx";

const redirect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

describe("AppShell", () => {
  it("expose la navigation principale, le lien Projets actif et le contenu", () => {
    render(
      <AppShell>
        <p>contenu</p>
      </AppShell>,
    );
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projets" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toHaveTextContent("contenu");
  });
});

describe("Providers", () => {
  it("rend ses enfants", () => {
    render(
      <Providers>
        <p>enfant</p>
      </Providers>,
    );
    expect(screen.getByText("enfant")).toBeInTheDocument();
  });
});

describe("Home", () => {
  it("redirige vers /projects", () => {
    expect(() => Home()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/projects");
  });
});
