// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { HeaderTabs, ProjectHeader } from "../src/index.ts";

/** TK-88 lot B : ProjectHeader (DESIGN.md §5.4, 02-design §5). */
const base = {
  project: { name: "Atelier Nova", href: "/projects/p1" },
  section: "Spec",
  page: "Fonctionnel",
  title: "Cahier fonctionnel",
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ProjectHeader", () => {
  it("ligne 1 : nav « Emplacement » en liste ordonnée, page courante en aria-current", () => {
    render(<ProjectHeader {...base} />);
    const nav = screen.getByRole("navigation", { name: "Emplacement" });
    const items = within(nav).getAllByRole("listitem");
    expect(items.map((i) => i.textContent?.replace(/\s*\/\s*$/, ""))).toEqual([
      "Atelier Nova",
      "Spec",
      "Fonctionnel",
    ]);
    expect(within(nav).getByRole("link", { name: "Atelier Nova" })).toHaveAttribute(
      "href",
      "/projects/p1",
    );
    expect(within(nav).getByText("Fonctionnel")).toHaveAttribute("aria-current", "page");
    expect(within(nav).queryByRole("link", { name: "Fonctionnel" })).toBeNull();
  });

  it("le titre reçoit une référence et un identifiant (cible du focus d'une page, TK-88 lot C)", () => {
    const ref = createRef<HTMLHeadingElement>();
    render(<ProjectHeader {...base} titleRef={ref} titleId="titre-page" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(ref.current).toBe(h1);
    expect(h1).toHaveAttribute("id", "titre-page");
  });

  it("ligne 2 : h1 24/600 focalisable par programme, résumé 13 px", () => {
    render(<ProjectHeader {...base} summary="7 fonctionnalités" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Cahier fonctionnel" });
    expect(h1).toHaveAttribute("tabindex", "-1");
    expect(h1.className).toContain("text-page-title");
    expect(screen.getByText("7 fonctionnalités")).toBeVisible();
  });

  it("SHA et âge de la spec pour l'équipe ; rien sinon, sans trou", () => {
    const { rerender } = render(
      <ProjectHeader {...base} sha={{ value: "a1b2c3d", age: "il y a 3 min" }} />,
    );
    expect(screen.getByText("a1b2c3d").className).toContain("font-mono");
    expect(screen.getByText(/spec à jour il y a 3 min/)).toBeVisible();
    rerender(<ProjectHeader {...base} />);
    expect(screen.queryByText("a1b2c3d")).toBeNull();
    expect(screen.queryByText(/spec à jour/)).toBeNull();
  });

  it("actions : la principale est avant la secondaire dans l'ordre de focus", () => {
    render(
      <ProjectHeader
        {...base}
        primaryAction={<button type="button">Nouvelle fonctionnalité</button>}
        secondaryActions={<button type="button">Cadrer avec l'IA</button>}
      />,
    );
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Nouvelle fonctionnalité", "Cadrer avec l'IA"]);
  });

  it("onglets : liens dans une nav nommée, actif en aria-current, compteur en pastille, défilement interne", () => {
    render(
      <ProjectHeader
        {...base}
        tabsLabel="Sections de la spec"
        tabs={[
          { label: "Fonctionnalités", href: "?tab=features", active: true, count: 7 },
          { label: "Décisions", href: "?tab=decisions" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Sections de la spec" });
    const active = within(nav).getByRole("link", { name: /Fonctionnalités/ });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toContain("font-semibold");
    expect(within(active).getByText("7").className).toContain("bg-secondary");
    expect(within(nav).getByRole("link", { name: "Décisions" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(nav.querySelector("ul")?.className).toContain("overflow-x-auto");
  });

  it("sans onglets : pas de seconde nav", () => {
    render(<ProjectHeader {...base} />);
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
  });

  it("fond --background et bordure basse --border", () => {
    render(<ProjectHeader {...base} />);
    const root = document.querySelector("[data-slot='project-header']") as HTMLElement;
    expect(root.className).toContain("bg-background");
    expect(root.className).toContain("border-b");
  });
});

describe("HeaderTabs (aussi utilisé par Réglages)", () => {
  it("onglets en liens dans une nav nommée, l'actif porte aria-current et un compteur facultatif", () => {
    render(
      <HeaderTabs
        label="Sections des réglages"
        tabs={[
          { label: "Membres", href: "/settings/members", active: true, count: 4 },
          { label: "GitHub", href: "/settings/github" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Sections des réglages" });
    expect(within(nav).getByRole("link", { name: /Membres/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: /Membres/ })).toHaveTextContent("4");
    expect(within(nav).getByRole("link", { name: "GitHub" })).not.toHaveAttribute("aria-current");
  });

  it("`status` rendu entre le h1 et le résumé", () => {
    render(<ProjectHeader {...base} summary="4 sur 7" status={<span>À valider</span>} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    const status = screen.getByText("À valider");
    const summary = screen.getByText("4 sur 7");
    expect(h1.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(status.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("le résumé est dans la même rangée que le h1 dès md, sous le titre en dessous", () => {
    render(<ProjectHeader {...base} summary="4 sur 7" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    const summary = screen.getByText("4 sur 7");
    expect(summary.parentElement).toBe(h1.parentElement);
    const tokens = summary.className.split(/\s+/);
    expect(tokens).toContain("max-md:basis-full");
    expect(tokens).not.toContain("basis-full");
    expect(tokens).toContain("md:basis-auto");
  });

  it("le séparateur « / » de l'emplacement a une marge de 12 (mx-3)", () => {
    render(<ProjectHeader {...base} />);
    const nav = screen.getByRole("navigation", { name: "Emplacement" });
    for (const sep of nav.querySelectorAll("[aria-hidden='true']")) {
      expect(sep).toHaveClass("mx-3");
    }
  });
});

describe("ProjectHeader : écart fil / titre (05 l.103)", () => {
  it("12 entre le fil et la rangée du titre", () => {
    render(<ProjectHeader {...base} />);
    const row = screen.getByRole("heading", { level: 1 }).parentElement;
    expect(row).toHaveClass("mt-3");
  });
});
