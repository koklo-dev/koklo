// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { NavItem, SecondaryNav } from "../src/index.ts";

/** TK-140 lot C : SecondaryNav et NavItem (B166, maquette 24 l.81-86, 259-261). */
const Link = ({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
  <a data-custom="oui" href={href} {...rest}>
    {children}
  </a>
);

const GROUPS = [
  {
    label: "Atelier",
    items: [
      { href: "/g", icon: "settings", label: "Général", current: true },
      { href: "/m", icon: "groups", label: "Membres", count: 4 },
    ],
  },
  { label: "Facturation", items: [{ href: "/p", icon: "key", label: "Abonnement" }] },
] as const;

describe("SecondaryNav", () => {
  it("nav nommée, largeur md:w-60, groupes nommés avec libellé 11/600 capitales masqué sous md", () => {
    render(<SecondaryNav label="Sections des réglages" groups={GROUPS} />);
    const nav = screen.getByRole("navigation", { name: "Sections des réglages" });
    expect(nav.className).toContain("md:w-60");
    const group = within(nav).getByRole("group", { name: "Atelier" });
    const label = within(group).getByText("Atelier");
    expect(label.className).toContain("text-group-label");
    expect(label.className).toContain("uppercase");
    expect(label.className).toContain("max-md:sr-only");
  });

  it("entrée courante : aria-current page, bg-secondary font-semibold, icône pleine primaire", () => {
    render(<SecondaryNav label="Sections" groups={GROUPS} />);
    const current = screen.getByRole("link", { name: "Général" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.className).toContain("bg-secondary");
    expect(current.className).toContain("font-semibold");
    expect(current.className).toContain("text-foreground");
    expect(current.querySelector("[aria-hidden]")?.getAttribute("class")).toContain("text-primary");
    expect(screen.getByRole("link", { name: /Membres/ })).not.toHaveAttribute("aria-current");
  });

  it("entrée : h-9, texte 14, cibles max-md:min-h-11, compteur en CountBadge outline", () => {
    render(<SecondaryNav label="Sections" groups={GROUPS} />);
    const link = screen.getByRole("link", { name: /Membres/ });
    expect(link.className).toContain("h-9");
    expect(link.className).toContain("text-body");
    expect(link.className).toContain("max-md:min-h-11");
    const badge = link.querySelector("[data-slot='count-badge']") as HTMLElement;
    expect(badge).toHaveTextContent("4");
  });

  it("sous md, rangée défilante", () => {
    render(<SecondaryNav label="Sections" groups={GROUPS} />);
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(nav.className).toContain("max-md:overflow-x-auto");
    expect(nav.className).toContain("max-md:flex-row");
  });

  it("LinkComponent est utilisé et Tab traverse les entrées dans l'ordre", async () => {
    render(<SecondaryNav label="Sections" groups={GROUPS} LinkComponent={Link} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    for (const link of links) expect(link).toHaveAttribute("data-custom", "oui");
    await userEvent.tab();
    expect(links[0]).toHaveFocus();
    await userEvent.tab();
    expect(links[1]).toHaveFocus();
    await userEvent.tab();
    expect(links[2]).toHaveFocus();
  });
});

describe("NavItem", () => {
  it("isolé : lien h-9 sans compteur", () => {
    render(<NavItem href="/x" icon="settings" label="Seul" />);
    const link = screen.getByRole("link", { name: "Seul" });
    expect(link.className).toContain("h-9");
    expect(link.querySelector("[data-slot='count-badge']")).toBeNull();
  });
});
