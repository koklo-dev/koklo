import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "../src/components/theme-toggle.tsx";
import { readTheme, THEME_INIT_SCRIPT } from "../src/lib/theme.ts";

function mockPrefersDark(dark: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  mockPrefersDark(false);
});

describe("thème par défaut", () => {
  it("est clair sans préférence stockée", () => {
    expect(readTheme()).toBe("light");
  });

  it("reste clair même si le système préfère le sombre (H-24)", () => {
    mockPrefersDark(true);
    expect(readTheme()).toBe("light");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

describe("ThemeToggle", () => {
  it("propose de passer au sombre en clair, avec un nom accessible", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Passer au thème sombre" })).toBeInTheDocument();
  });

  it("bascule la classe dark et le libellé au clic", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Passer au thème sombre" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Passer au thème clair" })).toBeInTheDocument();
  });

  it("revient au clair au second clic", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Passer au thème sombre" }));
    await userEvent.click(screen.getByRole("button", { name: "Passer au thème clair" }));
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("persiste le choix et le restaure au rechargement (script d'init, sans flash)", async () => {
    const { unmount } = render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Passer au thème sombre" }));
    unmount();
    document.documentElement.classList.remove("dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).toHaveClass("dark");
    expect(readTheme()).toBe("dark");
  });
});
