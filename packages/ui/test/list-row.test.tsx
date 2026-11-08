// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ListPanel, ListRow } from "../src/index.ts";

/** TK-140 lot B : ListPanel et ListRow (B164, maquette 10 l.124-134, maquette 12 l.61). */
const Link = ({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
  <a data-custom="oui" href={href} {...rest}>
    {children}
  </a>
);

describe("ListPanel", () => {
  it("section nommée par son titre (h2), liste à role=list, cadre rayon 12 sans débordement", () => {
    render(
      <ListPanel title="Dernières fonctionnalités">
        <ListRow title="Une" />
        <ListRow title="Deux" />
      </ListPanel>,
    );
    const region = screen.getByRole("region", { name: "Dernières fonctionnalités" });
    expect(region).toHaveClass("rounded-xl", "overflow-hidden", "border");
    const h2 = within(region).getByRole("heading", { level: 2 });
    expect(h2).toHaveClass("text-section-title");
    expect(within(region).getByRole("list")).toBeInTheDocument();
    expect(within(region).getAllByRole("listitem")).toHaveLength(2);
  });

  it("sans titre : `label` nomme la section et aucun titre n'est rendu", () => {
    render(
      <ListPanel label="Groupes">
        <ListRow title="Une" />
      </ListPanel>,
    );
    expect(screen.getByRole("region", { name: "Groupes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("`viewAll` : lien « Tout voir » avec flèche décorative", () => {
    render(
      <ListPanel title="Récents" viewAll={{ href: "/tout" }}>
        <ListRow title="Une" />
      </ListPanel>,
    );
    const link = screen.getByRole("link", { name: "Tout voir" });
    expect(link).toHaveAttribute("href", "/tout");
    expect(link).toHaveClass("text-primary");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("pied sur --surface en 12 muted", () => {
    render(
      <ListPanel title="Récents" footer="3 sur 12">
        <ListRow title="Une" />
      </ListPanel>,
    );
    const footer = screen.getByText("3 sur 12");
    expect(footer).toHaveClass("bg-surface", "text-caption", "text-muted-foreground", "border-t");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ListRow", () => {
  it("li : bordure haute sauf la première, marges 12/16, titre 14/500 tronqué, sous-titre muted", () => {
    render(
      <ListPanel title="L">
        <ListRow title="Première" subtitle="3 critères · R-012" />
        <ListRow title="Seconde" />
      </ListPanel>,
    );
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveClass("first:border-t-0", "border-t");
    expect(first).toHaveClass("px-4", "py-3");
    expect(second).toHaveClass("border-t");
    const title = screen.getByText("Première");
    expect(title).toHaveClass("truncate", "text-body", "font-medium");
    expect(screen.getByText("3 critères · R-012")).toHaveClass(
      "text-caption",
      "text-muted-foreground",
    );
  });

  it("`fixedHeight` : hauteur 52 sans marge verticale", () => {
    render(
      <ListPanel title="L">
        <ListRow title="Fixe" fixedHeight />
      </ListPanel>,
    );
    expect(screen.getByRole("listitem")).toHaveClass("h-[52px]");
    expect(screen.getByRole("listitem")).not.toHaveClass("py-3");
  });

  it('`as="div"` : contenu de ligne sans li ni bordure ni marge, pour un hôte qui pose déjà son li (VirtualList)', () => {
    render(
      <ul>
        <li data-testid="host">
          <ListRow
            as="div"
            title="Dans l'hôte"
            subtitle="2 critères"
            leading={<span>F-001</span>}
          />
        </li>
      </ul>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    const row = screen.getByText("Dans l'hôte").closest("[data-slot='list-row']") as HTMLElement;
    expect(row.tagName).toBe("DIV");
    expect(row).not.toHaveClass("border-t", "px-4");
    expect(screen.getByText("2 critères")).toHaveClass("text-caption", "text-muted-foreground");
  });

  it("`leading` avant le titre, `trailing` après", () => {
    render(
      <ListPanel title="L">
        <ListRow title="T" leading={<span>TK-1</span>} trailing={<span>validée</span>} />
      </ListPanel>,
    );
    const text = screen.getByRole("listitem").textContent;
    expect(text?.indexOf("TK-1")).toBeLessThan(text?.indexOf("T", 4) ?? 0);
    expect(text?.indexOf("validée")).toBeGreaterThan(text?.indexOf("TK-1") ?? 0);
  });

  it("`selected` : aria-current=true et fond --secondary", () => {
    render(
      <ListPanel title="L">
        <ListRow title="Choisie" selected onSelect={() => undefined} />
        <ListRow title="Autre" onSelect={() => undefined} />
      </ListPanel>,
    );
    const [chosen, other] = screen.getAllByRole("listitem");
    expect(chosen).toHaveClass("bg-secondary");
    expect(screen.getByRole("button", { name: "Choisie" })).toHaveAttribute("aria-current", "true");
    expect(other).not.toHaveClass("bg-secondary");
    expect(screen.getByRole("button", { name: "Autre" })).not.toHaveAttribute("aria-current");
  });

  it("`href` : lien atteignable au clavier, focus --ring, LinkComponent respecté", () => {
    render(
      <ListPanel title="L">
        <ListRow title="Ouvrir" href="/x" LinkComponent={Link} />
      </ListPanel>,
    );
    const link = screen.getByRole("link", { name: "Ouvrir" });
    expect(link).toHaveAttribute("data-custom", "oui");
    expect(link).toHaveAttribute("href", "/x");
    expect(link.className).toMatch(/focus-visible:ring-ring|focus-visible:ring-2/);
  });

  it("`onSelect` : bouton activé par Entrée et Espace", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ListPanel title="L">
        <ListRow title="Choisir" onSelect={onSelect} />
      </ListPanel>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Choisir" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("une action en queue reste cliquable sans activer la ligne", async () => {
    const onSelect = vi.fn();
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <ListPanel title="L">
        <ListRow
          title="Ligne"
          onSelect={onSelect}
          trailing={
            <button type="button" onClick={onAction}>
              Retirer
            </button>
          }
        />
      </ListPanel>,
    );
    await user.click(screen.getByRole("button", { name: "Retirer" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("sans href ni onSelect : ligne statique, ni lien ni bouton", () => {
    render(
      <ListPanel title="L">
        <ListRow title="Statique" />
      </ListPanel>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("ListRow : sous-titre 12/400 et groupes empilés (12 l.61, 126)", () => {
  it("sous-titre en text-caption font-normal", () => {
    render(
      <ListPanel label="Liste">
        <ListRow title="Première" subtitle="3 critères · R-012" />
      </ListPanel>,
    );
    expect(screen.getByText("3 critères · R-012")).toHaveClass("text-caption", "font-normal");
  });
});
