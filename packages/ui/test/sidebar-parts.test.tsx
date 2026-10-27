// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import * as ui from "../src/index.ts";
import { DESKTOP, setViewport } from "./viewport.ts";

const {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} = ui;

beforeEach(() => setViewport(DESKTOP));

function NoProvider() {
  useSidebar();
  return null;
}

function Parts({ collapsible = "icon" }: { collapsible?: "icon" | "none" | "offcanvas" }) {
  return (
    <SidebarProvider>
      <Sidebar collapsible={collapsible} variant="floating" side="right">
        <SidebarInput aria-label="Filtrer" />
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Groupe</SidebarGroupLabel>
            <SidebarGroupLabel asChild>
              <h2>Titre</h2>
            </SidebarGroupLabel>
            <SidebarGroupAction aria-label="Ajouter">+</SidebarGroupAction>
            <SidebarGroupAction asChild>
              <a href="/x">lien</a>
            </SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton variant="outline" size="lg" tooltip={{ children: "Info" }}>
                    Un
                  </SidebarMenuButton>
                  <SidebarMenuAction showOnHover aria-label="Plus">
                    …
                  </SidebarMenuAction>
                  <SidebarMenuAction asChild>
                    <a href="/y">y</a>
                  </SidebarMenuAction>
                  <SidebarMenuBadge>3</SidebarMenuBadge>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild size="sm" isActive>
                        <a href="/z">Sous</a>
                      </SidebarMenuSubButton>
                      <SidebarMenuSubButton size="md" href="/w">
                        Autre
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
}

describe("sous-composants du bloc sidebar-07", () => {
  it("rend groupes, menus, sous-menus, badges et squelettes", () => {
    render(<Parts />);
    expect(screen.getByText("Groupe")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Titre" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sous" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Autre" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Filtrer" })).toBeInTheDocument();
  });

  it("le rail bascule la barre", async () => {
    render(<Parts />);
    const rail = screen.getByRole("button", { name: "Toggle Sidebar" });
    await userEvent.click(rail);
    expect(document.cookie).toContain("sidebar_state=false");
  });

  it("collapsible='none' rend un bloc statique", () => {
    render(<Parts collapsible="none" />);
    expect(screen.getByText("Groupe")).toBeInTheDocument();
  });

  it("useSidebar hors du fournisseur échoue clairement", () => {
    expect(() => render(<NoProvider />)).toThrow(/SidebarProvider/);
  });

  it("le fournisseur contrôlé délègue à onOpenChange", async () => {
    const calls: boolean[] = [];
    render(
      <SidebarProvider open onOpenChange={(v) => calls.push(v)}>
        <Sidebar>
          <SidebarRail />
        </Sidebar>
      </SidebarProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(calls).toEqual([false]);
  });
});
