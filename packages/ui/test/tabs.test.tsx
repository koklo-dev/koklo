// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  HeaderTabs,
  Tabs,
  TabsContent,
  TabsList,
  TabsNav,
  type TabsNavItem,
  TabsTrigger,
} from "../src/index.ts";

/** TK-139 lot C, cas 14 et 15 : `Tabs` underline (mode tablist et mode lien), `HeaderTabs` ré-exporté. */
function Underline({ size }: { size?: "sm" }) {
  return (
    <Tabs defaultValue="a" variant="underline" size={size}>
      <TabsList aria-label="États">
        <TabsTrigger value="a">Ouverts</TabsTrigger>
        <TabsTrigger value="b" count={3}>
          Fermés
        </TabsTrigger>
      </TabsList>
      <TabsContent value="a">Contenu A</TabsContent>
      <TabsContent value="b">Contenu B</TabsContent>
    </Tabs>
  );
}

describe("Tabs underline, mode tablist", () => {
  it("tablist, aria-selected, activation et flèches", async () => {
    const user = userEvent.setup();
    render(<Underline />);
    const first = screen.getByRole("tab", { name: "Ouverts" });
    expect(first).toHaveAttribute("aria-selected", "true");
    first.focus();
    await user.keyboard("{ArrowRight}");
    const second = screen.getByRole("tab", { name: /Fermés/ });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Contenu B")).toBeVisible();
  });

  it("onglet 36 de haut, trait de 2 en --primary à l'actif, compteur par CountBadge", () => {
    render(<Underline />);
    const tab = screen.getByRole("tab", { name: "Ouverts" });
    expect(tab.className).toMatch(/\bh-9\b/);
    expect(tab.className).toContain("data-[state=active]:border-primary");
    expect(tab.className).toContain("data-[state=active]:font-semibold");
    expect(tab.className).toContain("border-b-2");
    expect(document.querySelector("[data-slot='count-badge']")).toHaveTextContent("3");
    expect(screen.getByRole("tablist").className).toMatch(/gap-5/);
    expect(screen.getByRole("tablist").className).toMatch(/overflow-x-auto/);
  });

  it("size sm : 13 px", () => {
    render(<Underline size="sm" />);
    const { className } = screen.getByRole("tab", { name: "Ouverts" });
    expect(className).toContain("text-meta");
    expect(className).not.toContain("text-[13px]");
  });

  it("segmented inchangé par défaut", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Vue">
          <TabsTrigger value="a">Liste</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole("tablist").className).toContain("bg-muted");
    expect(screen.getByRole("tab").className).toContain("data-[state=active]:bg-background");
  });
});

describe("Tabs underline, mode lien", () => {
  const tabs: TabsNavItem[] = [
    { label: "Membres", href: "/m", active: true, count: 4, icon: "groups" },
    { label: "GitHub", href: "/g" },
  ];

  it("nav nommée, aria-current, 36 de haut, écart 20, actif 600 + trait --primary, défilement", () => {
    render(<TabsNav label="Réglages" tabs={tabs} />);
    const nav = screen.getByRole("navigation", { name: "Réglages" });
    const link = within(nav).getByRole("link", { name: /Membres/ });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link.className).toMatch(/\bh-9\b/);
    expect(link.className).toContain("border-primary");
    expect(link.className).toContain("font-semibold");
    expect(nav.querySelector("ul")?.className).toMatch(/gap-5/);
    expect(nav.querySelector("ul")?.className).toMatch(/overflow-x-auto/);
    expect(link.querySelector("[data-slot='count-badge']")).toHaveTextContent("4");
    expect(link.querySelector("svg[data-icon='groups']")).toHaveAttribute("aria-hidden", "true");
    expect(within(nav).getByRole("link", { name: "GitHub" })).not.toHaveAttribute("aria-current");
  });

  it("HeaderTabs rend le même nav que TabsNav", () => {
    const { container: a } = render(<TabsNav label="X" tabs={tabs} className="-mb-4 mt-3" />);
    const { container: b } = render(<HeaderTabs label="X" tabs={tabs} />);
    expect(b.innerHTML).toBe(a.innerHTML);
  });
});
