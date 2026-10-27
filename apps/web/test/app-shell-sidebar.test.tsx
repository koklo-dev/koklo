import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/components/app-shell.tsx";
import { DESKTOP, MOBILE, setViewport } from "./viewport.ts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/projects",
}));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  setViewport(DESKTOP);
});

function renderShell() {
  return render(
    <AppShell>
      <h1>Projets</h1>
    </AppShell>,
  );
}

describe("T4.1 / T2.7 : gabarit sidebar-07 (bureau)", () => {
  it("conserve data-testid=app-shell, un seul main et aucun complementary", () => {
    renderShell();
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("nav « Navigation principale » contient le lien Projets avec aria-current=page", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    expect(within(nav).getByRole("link", { name: "Projets" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("n'embarque aucune donnée de démonstration du bloc", () => {
    renderShell();
    const shell = screen.getByTestId("app-shell");
    for (const demo of ["shadcn", "Acme", "Playground", "Design Engineering"]) {
      expect(shell).not.toHaveTextContent(demo);
    }
  });

  it("expose la bascule de thème (bouton nommé) dans la sidebar et la marque Koklo", () => {
    renderShell();
    expect(screen.getByRole("button", { name: "Passer au thème sombre" })).toBeInTheDocument();
    expect(screen.getByTestId("app-shell")).toHaveTextContent("Koklo");
  });
});

describe("T2.6 : clavier et trigger", () => {
  it("le trigger est un bouton avec aria-label et aria-expanded", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: "Réduire la barre latérale" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("Tab atteint le lien Projets puis la bascule de thème, dans cet ordre", async () => {
    renderShell();
    const link = screen.getByRole("link", { name: "Projets" });
    const toggle = screen.getByRole("button", { name: "Passer au thème sombre" });
    const seen: Element[] = [];
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      seen.push(document.activeElement as Element);
    }
    expect(seen).toContain(link);
    expect(seen).toContain(toggle);
    expect(seen.indexOf(link)).toBeLessThan(seen.indexOf(toggle));
  });

  it("replié, la bascule de thème et le lien restent nommés et utilisables", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Réduire la barre latérale" }));
    expect(screen.getByRole("link", { name: "Projets" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Passer au thème sombre" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Passer au thème clair" })).toBeInTheDocument();
  });
});

describe("T2.5 : thème clair et sombre dans le gabarit", () => {
  it("clair par défaut, la bascule passe en sombre puis revient au clair", async () => {
    renderShell();
    expect(document.documentElement).not.toHaveClass("dark");
    await userEvent.click(screen.getByRole("button", { name: "Passer au thème sombre" }));
    expect(document.documentElement).toHaveClass("dark");
    await userEvent.click(screen.getByRole("button", { name: "Passer au thème clair" }));
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

describe("T2.7 : mobile sous 768 px", () => {
  it("la navigation est dans une Sheet fermée, ouverte par le trigger, fermée par Échap", async () => {
    setViewport(MOBILE);
    renderShell();
    expect(screen.queryByRole("navigation", { name: "Navigation principale" })).toBeNull();
    const trigger = screen.getByRole("button", { name: "Ouvrir la barre latérale" });
    await userEvent.click(trigger);
    const nav = await screen.findByRole("navigation", { name: "Navigation principale" });
    expect(within(nav).getByRole("link", { name: "Projets" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: "Navigation principale" })).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
