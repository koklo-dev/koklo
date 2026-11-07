// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "../src/index.ts";

/** TK-140 lot B : PageHeader (B165, maquette 24 l.58-75). */
describe("PageHeader", () => {
  it("h1 par défaut, `headingAs` change le niveau, titleRef et titleId transmis", () => {
    const ref = createRef<HTMLHeadingElement>();
    const { rerender } = render(<PageHeader title="Réglages" titleRef={ref} titleId="t" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Réglages" });
    expect(ref.current).toBe(h1);
    expect(h1).toHaveAttribute("id", "t");
    expect(h1).toHaveClass("text-page-title");
    rerender(<PageHeader title="Réglages" headingAs="h4" />);
    expect(screen.getByRole("heading", { level: 4 })).toBeInTheDocument();
  });

  it("fil facultatif : absent par défaut", () => {
    render(<PageHeader title="Réglages" />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("fil « Fil d'Ariane » en ol : premier en font-medium text-foreground, dernier aria-current=page", () => {
    render(
      <PageHeader
        title="Membres"
        breadcrumb={[
          { label: "Atelier Lumière", href: "/o" },
          { label: "Réglages" },
          { label: "Membres" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Fil d'Ariane" });
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const first = within(nav).getByRole("link", { name: "Atelier Lumière" });
    expect(first).toHaveClass("font-medium", "text-foreground");
    expect(first).toHaveAttribute("href", "/o");
    expect(items[2]).toHaveAttribute("aria-current", "page");
    expect(items[1]).not.toHaveAttribute("aria-current");
    expect(nav.querySelector("ol")).not.toBeNull();
  });

  it("`status` et `actions` rendus, jamais de SHA ni d'onglets", () => {
    render(
      <PageHeader
        title="Réglages"
        status={<span>Plan actif</span>}
        actions={<button type="button">Inviter</button>}
      />,
    );
    expect(screen.getByText("Plan actif")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inviter" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText(/spec à jour/)).toBeNull();
  });
});

describe("PageHeader : ligne de contexte (24 l.77)", () => {
  it("summary 13 muted sous le titre, absent par défaut", () => {
    const { rerender } = render(<PageHeader title="Réglages" />);
    expect(screen.queryByText(/projets/)).toBeNull();
    rerender(<PageHeader title="Réglages" summary="Atelier Lumière · 3 projets · 6 membres" />);
    const line = screen.getByText("Atelier Lumière · 3 projets · 6 membres");
    expect(line).toHaveClass("text-meta", "text-muted-foreground");
  });
});
