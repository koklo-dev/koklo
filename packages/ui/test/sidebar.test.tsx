// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import * as ui from "../src/index.ts";
import { DESKTOP, MOBILE, setViewport } from "./viewport.ts";

const {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} = ui;

function Layout() {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>entête</SidebarHeader>
        <SidebarContent>
          <nav aria-label="Navigation principale">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive tooltip="Projets">
                  <a href="/projects">Projets</a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter>pied</SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <SidebarTrigger />
        <main>contenu</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

beforeEach(() => setViewport(DESKTOP));

describe("A1 : composants de gabarit exportés par @koklo/ui (sidebar-07)", () => {
  it.each([
    "Sidebar",
    "SidebarProvider",
    "SidebarInset",
    "SidebarTrigger",
    "SidebarHeader",
    "SidebarContent",
    "SidebarFooter",
    "SidebarMenu",
    "SidebarMenuItem",
    "SidebarMenuButton",
    "Tooltip",
    "TooltipTrigger",
    "TooltipContent",
    "TooltipProvider",
  ])("exporte %s", (name) => {
    expect(ui, name).toHaveProperty([name]);
  });
});

describe("T2.6 : SidebarTrigger (bureau)", () => {
  it("est un vrai bouton nommé, avec aria-expanded, qui bascule au clic", async () => {
    render(<Layout />);
    const trigger = screen.getByRole("button", { name: "Réduire la barre latérale" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(trigger);
    const reopened = screen.getByRole("button", { name: "Ouvrir la barre latérale" });
    expect(reopened).toHaveAttribute("aria-expanded", "false");
  });

  it("se bascule au clavier (Entrée) et avec le raccourci Ctrl+B", async () => {
    render(<Layout />);
    screen.getByRole("button", { name: "Réduire la barre latérale" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Ouvrir la barre latérale" })).toBeInTheDocument();
    await userEvent.keyboard("{Control>}b{/Control}");
    expect(screen.getByRole("button", { name: "Réduire la barre latérale" })).toBeInTheDocument();
  });

  it("replié, le lien garde son nom accessible", async () => {
    render(<Layout />);
    await userEvent.click(screen.getByRole("button", { name: "Réduire la barre latérale" }));
    expect(screen.getByRole("link", { name: "Projets" })).toBeInTheDocument();
  });
});

describe("T4.1 : repères (aucun aside / complementary)", () => {
  it("ne produit aucun rôle complementary et conserve nav et main", () => {
    render(<Layout />);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("contenu");
  });
});

describe("T2.6 / T2.7 : mobile sous 768 px (Sheet)", () => {
  it("le panneau est fermé par défaut puis s'ouvre avec le trigger", async () => {
    setViewport(MOBILE);
    render(<Layout />);
    expect(screen.queryByRole("link", { name: "Projets" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir la barre latérale" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projets" })).toBeInTheDocument();
  });

  it("Échap ferme la Sheet et restitue le focus au trigger", async () => {
    setViewport(MOBILE);
    render(<Layout />);
    const trigger = screen.getByRole("button", { name: "Ouvrir la barre latérale" });
    await userEvent.click(trigger);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("le point de rupture est 768 px : 768 reste bureau, 767 passe en mobile", () => {
    setViewport(768);
    const { unmount } = render(<Layout />);
    expect(screen.getByRole("link", { name: "Projets" })).toBeInTheDocument();
    unmount();
    setViewport(767);
    render(<Layout />);
    expect(screen.queryByRole("link", { name: "Projets" })).toBeNull();
  });
});

describe("Tooltip (repli en icônes)", () => {
  it("s'affiche au focus clavier du déclencheur", async () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button">Déclencheur</button>
          </TooltipTrigger>
          <TooltipContent>Aide</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Aide");
  });
});
