// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell, ShellCollapseButton, ShellNavGroup, ShellNavItem } from "../src/index.ts";
import { DESKTOP, setViewport } from "./viewport.ts";

/** TK-140 lot C : ShellNavGroup et ShellNavItem count (B166, maquette 05 l.48, 63, 78, 226). */
function Shell({ separator = false }: { separator?: boolean }) {
  return (
    <AppShell
      mobileTitle="Koklo"
      sidebar={
        <nav aria-label="Navigation principale">
          <ShellNavGroup label="Projet" separator={separator}>
            <ShellNavItem href="/t" icon="view_kanban" label="Tickets" count={12} />
            <ShellNavItem href="/b" icon="inbox" label="Boîte" badge={<span>3</span>} />
          </ShellNavGroup>
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

describe("ShellNavGroup", () => {
  it("groupe nommé, libellé 11/600 capitales", () => {
    render(<Shell />);
    const group = screen.getByRole("group", { name: "Projet" });
    const label = within(group).getByText("Projet");
    expect(label.className).toContain("text-group-label");
    expect(label.className).toContain("uppercase");
    expect(group.className).not.toContain("border-t");
  });

  it("separator ajoute border-t et pt-3", () => {
    render(<Shell separator />);
    const group = screen.getByRole("group", { name: "Projet" });
    expect(group.className).toContain("border-t");
    expect(group.className).toContain("pt-3");
  });

  it("barre repliée : trait de 24 aria-hidden à la place du libellé, groupe toujours nommé", async () => {
    render(<Shell />);
    await userEvent.click(screen.getByRole("button", { name: "Replier la barre" }));
    const group = screen.getByRole("group", { name: "Projet" });
    expect(within(group).queryByText("Projet")).toBeNull();
    const rule = group.querySelector("[data-slot='shell-nav-group-rule']") as HTMLElement;
    expect(rule).toHaveAttribute("aria-hidden", "true");
    expect(rule).toHaveClass("bg-border");
    expect(rule).not.toHaveClass("bg-border-strong");
    expect(rule.className).toContain("w-6");
  });
});

describe("ShellNavItem count", () => {
  it("CountBadge après le libellé quand la barre est étendue", () => {
    render(<Shell />);
    const link = screen.getByRole("link", { name: /Tickets/ });
    const badge = link.querySelector("[data-slot='count-badge']") as HTMLElement;
    expect(badge).toHaveTextContent("12");
    expect(link.textContent).toBe("Tickets12");
  });

  it("repliée : badge masqué, nom accessible « Tickets, 12 »", async () => {
    render(<Shell />);
    await userEvent.click(screen.getByRole("button", { name: "Replier la barre" }));
    const link = screen.getByRole("link", { name: "Tickets, 12" });
    expect(link.querySelector("[data-slot='count-badge']")).toBeNull();
  });

  it("badge reste accepté", () => {
    render(<Shell />);
    expect(screen.getByRole("link", { name: /Boîte/ })).toHaveTextContent("3");
  });
});

describe("ShellCollapseButton", () => {
  it("« Déplier la barre » une fois repliée, annonce « Barre étendue » inchangée", async () => {
    render(<Shell />);
    await userEvent.click(screen.getByRole("button", { name: "Replier la barre" }));
    await userEvent.click(screen.getByRole("button", { name: "Déplier la barre" }));
    expect(
      document.querySelector('[data-slot="shell-announcer"]') as HTMLElement,
    ).toHaveTextContent("Barre étendue");
  });

  it("TK-141 : bouton de 34 px (planche 05, footBtn)", () => {
    render(<Shell />);
    expect(screen.getByRole("button", { name: "Replier la barre" })).toHaveClass("h-8.5");
  });
});
