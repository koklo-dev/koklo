import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "../src/components/theme-toggle.tsx";
import { applyTheme, readTheme, resolveTheme, THEME_INIT_SCRIPT } from "../src/lib/theme.ts";

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

describe("préférence « Système » (B100)", () => {
  it("resolveTheme : système sombre -> dark, système clair -> light, choix explicite inchangé", () => {
    mockPrefersDark(true);
    expect(resolveTheme("system")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    mockPrefersDark(false);
    expect(resolveTheme("system")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("applyTheme('system') enregistre « system » et suit le système", () => {
    mockPrefersDark(true);
    applyTheme("system");
    expect(localStorage.getItem("koklo-theme")).toBe("system");
    expect(readTheme()).toBe("system");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("le script d'init applique « system » selon prefers-color-scheme, sans flash", () => {
    localStorage.setItem("koklo-theme", "system");
    mockPrefersDark(true);
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).toHaveClass("dark");
    document.documentElement.classList.remove("dark");
    mockPrefersDark(false);
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("une valeur inconnue en stockage vaut Clair", () => {
    localStorage.setItem("koklo-theme", "violet");
    expect(readTheme()).toBe("light");
  });
});
