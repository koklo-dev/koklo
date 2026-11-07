// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell, ShellCollapseButton, ShellNavItem } from "../src/index.ts";
import { DESKTOP, MOBILE, setViewport } from "./viewport.ts";

/** TK-88 lot B : AppShell (02-design §3, §4, §5 ; DESIGN.md §5.4). */
const KEY = "koklo.sidebar";

function Shell() {
  return (
    <AppShell
      mobileTitle="Koklo"
      sidebar={
        <nav aria-label="Navigation principale">
          <ShellNavItem href="/projects/p1/tickets" icon="view_kanban" label="Tickets" active />
          <ShellNavItem href="/projects" icon="folder_open" label="Tous les projets" />
          <ShellCollapseButton />
        </nav>
      }
    >
      <main>
        <h1>Contenu</h1>
      </main>
    </AppShell>
  );
}

beforeEach(() => {
  setViewport(DESKTOP);
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

const sidebar = () => document.querySelector('[data-slot="app-shell-sidebar"]') as HTMLElement;
const announcer = () => document.querySelector('[data-slot="shell-announcer"]') as HTMLElement;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("AppShell sur grand écran", () => {
  it("barre collante pleine hauteur de 256 px, sur --sidebar, avec bordure droite", () => {
    render(<Shell />);
    expect(sidebar()).toHaveAttribute("data-state", "expanded");
    for (const cls of [
      "sticky",
      "top-0",
      "h-dvh",
      "w-64",
      "overflow-y-auto",
      "bg-sidebar",
      "border-r",
    ]) {
      expect(sidebar().className, cls).toContain(cls);
    }
    expect(screen.getByRole("heading", { level: 1, name: "Contenu" })).toBeVisible();
  });

  it("« Replier la barre » passe à 64 px, mémorise l'état en localStorage et l'annonce", async () => {
    render(<Shell />);
    await userEvent.click(screen.getByRole("button", { name: "Replier la barre" }));
    expect(sidebar()).toHaveAttribute("data-state", "collapsed");
    expect(sidebar().className).toContain("w-16");
    expect(localStorage.getItem(KEY)).toBe("collapsed");
    expect(announcer()).toHaveTextContent("Barre repliée");
    await userEvent.click(screen.getByRole("button", { name: "Déplier la barre" }));
    expect(sidebar()).toHaveAttribute("data-state", "expanded");
    expect(localStorage.getItem(KEY)).toBe("expanded");
    expect(announcer()).toHaveTextContent("Barre étendue");
    // La coquille n'ajoute aucun role="status" : celui de la page reste unique (règle 5).
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("relit l'état mémorisé au montage", async () => {
    localStorage.setItem(KEY, "collapsed");
    render(<Shell />);
    await screen.findByRole("button", { name: "Déplier la barre" });
    expect(sidebar()).toHaveAttribute("data-state", "collapsed");
  });

  it("sans stockage (lecture et écriture qui lèvent) : étendue, bascule sans erreur, aucun cookie", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqué");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqué");
    });
    render(<Shell />);
    expect(sidebar()).toHaveAttribute("data-state", "expanded");
    await userEvent.click(screen.getByRole("button", { name: "Replier la barre" }));
    expect(sidebar()).toHaveAttribute("data-state", "collapsed");
    expect(document.cookie).toBe("");
  });

  it.each([
    ["Ctrl B", { ctrlKey: true }],
    ["⌘ B", { metaKey: true }],
  ])("%s bascule la barre", async (_label, modifier) => {
    render(<Shell />);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "b", bubbles: true, ...modifier }),
      );
    });
    expect(sidebar()).toHaveAttribute("data-state", "collapsed");
  });

  it("rail replié : une entrée de navigation n'a plus que son icône, avec un aria-label", async () => {
    render(<Shell />);
    expect(screen.getByRole("link", { name: "Tickets" })).toHaveTextContent("Tickets");
    await userEvent.click(screen.getByRole("button", { name: "Replier la barre" }));
    const link = screen.getByRole("link", { name: "Tickets" });
    expect(link).toHaveAttribute("aria-label", "Tickets");
    expect(link).not.toHaveTextContent("Tickets");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("entrée active : fond --background, contour --border, texte 600, icône --primary", () => {
    render(<Shell />);
    const active = screen.getByRole("link", { name: "Tickets" });
    for (const cls of ["bg-background", "border-border", "font-semibold"]) {
      expect(active.className, cls).toContain(cls);
    }
    expect(active.querySelector("svg")?.getAttribute("class")).toContain("text-primary");
    expect(screen.getByRole("link", { name: "Tous les projets" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});

describe("AppShell sous 768 px", () => {
  beforeEach(() => setViewport(MOBILE));

  it("pas de barre : en-tête de 56 px avec un bouton menu de 44 px", () => {
    render(<Shell />);
    expect(sidebar()).toBeNull();
    const button = screen.getByRole("button", { name: "Ouvrir le menu" });
    expect(button.className).toContain("size-11");
    expect(button.closest("header")?.className).toContain("h-14");
    expect(screen.queryByRole("link", { name: "Tickets" })).toBeNull();
  });

  it("l'en-tête est au-dessus du contenu, pas à sa gauche (colonne, rangée dès 768 px)", () => {
    render(<Shell />);
    const root = screen
      .getByRole("button", { name: "Ouvrir le menu" })
      .closest("header")?.parentElement;
    expect(root?.className).toContain("flex-col");
    expect(root?.className).toContain("md:flex-row");
  });

  it("le bouton ouvre un tiroir de 288 px ; Échap le ferme et rend le focus au bouton", async () => {
    render(<Shell />);
    const button = screen.getByRole("button", { name: "Ouvrir le menu" });
    await userEvent.click(button);
    const drawer = screen.getByRole("dialog", { name: "Navigation principale" });
    expect(drawer.className).toContain("w-72");
    expect(within(drawer).getByRole("link", { name: "Tickets" })).toBeVisible();
    // Cible tactile de 44 px dans le tiroir (36 px sur la barre de bureau).
    expect(within(drawer).getByRole("link", { name: "Tickets" }).className).toContain("h-11");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("le tiroir se ferme après une navigation", async () => {
    render(<Shell />);
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));
    const link = screen.getByRole("link", { name: "Tous les projets" });
    link.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(link);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dans le tiroir, la barre n'est jamais repliée (libellés visibles)", async () => {
    localStorage.setItem(KEY, "collapsed");
    render(<Shell />);
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir le menu" }));
    expect(screen.getByRole("link", { name: "Tickets" })).toHaveTextContent("Tickets");
  });
});
