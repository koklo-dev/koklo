// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountBar } from "../src/index.ts";

/**
 * TK-94 lot B (passation 07 §1.1 et §5, DESIGN.md v2.1 §5.3, 02-design §4) : `CountBar`.
 * Total en gras · « N chargées » · compteur de filtre, tri à droite ; une région `role="status"` qui annonce
 * l'arrivée d'une page sans déplacer le focus.
 */
const NOUN = { one: "fonctionnalité", other: "fonctionnalités" };

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("CountBar", () => {
  it("affiche le total du serveur en gras, les chargées et le compteur de filtre", () => {
    render(<CountBar total={1000} loaded={50} noun={NOUN} filterLabel="31 à valider" />);
    const bar = document.querySelector("[data-slot='count-bar']") as HTMLElement;
    expect(bar).toHaveTextContent("1 000 fonctionnalités · 50 chargées · 31 à valider");
    const strong = bar.querySelector("strong, [data-total]") as HTMLElement;
    expect(strong).toHaveTextContent("1 000");
    expect(strong.className).toMatch(/font-semibold/);
    expect(strong.className).toMatch(/text-foreground/);
  });

  it("13 px, texte secondaire --muted-foreground", () => {
    render(<CountBar total={248} loaded={50} noun={NOUN} />);
    const bar = document.querySelector("[data-slot='count-bar']") as HTMLElement;
    expect(bar.className).toMatch(/text-meta/);
    expect(bar.className).toMatch(/text-muted-foreground/);
  });

  it("accorde le nom au singulier pour 1 et 0", () => {
    const { rerender } = render(<CountBar total={1} loaded={1} noun={NOUN} />);
    expect(document.querySelector("[data-slot='count-bar']")).toHaveTextContent("1 fonctionnalité");
    rerender(<CountBar total={0} loaded={0} noun={NOUN} />);
    expect(document.querySelector("[data-slot='count-bar']")).toHaveTextContent("0 fonctionnalité");
  });

  it("n'écrit pas « chargées » quand tout est chargé", () => {
    render(<CountBar total={12} loaded={12} noun={NOUN} />);
    expect(document.querySelector("[data-slot='count-bar']")).not.toHaveTextContent("chargées");
  });

  it("tri à droite avec l'icône swap_vert", () => {
    render(<CountBar total={248} loaded={50} noun={NOUN} sort="identifiant" />);
    const sort = screen.getByText("Tri : identifiant");
    expect(sort.closest("[data-slot='count-bar-sort']")).not.toBeNull();
    expect(sort.parentElement?.className).toMatch(/ml-auto/);
    expect(sort.parentElement?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("le nom est dans le gras ; le nombre garde data-total", () => {
    render(<CountBar total={248} loaded={50} noun={NOUN} filterLabel="31 à valider" />);
    const strong = document.querySelector("[data-slot='count-bar'] strong") as HTMLElement;
    expect(strong).toHaveTextContent("248 fonctionnalités");
    expect(strong.textContent).not.toMatch(/chargées|valider/);
    expect(strong.querySelector("[data-total]")).toHaveTextContent(/^248$/);
  });

  it("tri : « Tri : x » puis l'icône swap_vert après le texte", () => {
    render(<CountBar total={248} loaded={50} noun={NOUN} sort="identifiant" />);
    const label = screen.getByText("Tri : identifiant");
    const icon = label.parentElement?.querySelector("svg") as SVGElement;
    expect(label.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("recherche vide : « 0 résultat pour « annulation groupée » », gras sur « 0 résultat »", () => {
    render(<CountBar total={0} loaded={0} noun={NOUN} query="annulation groupée" />);
    const bar = document.querySelector("[data-slot='count-bar']") as HTMLElement;
    expect(bar).toHaveTextContent("0 résultat pour « annulation groupée »");
    const strong = bar.querySelector("strong") as HTMLElement;
    expect(strong.textContent).toBe("0 résultat");
    expect(strong.className).toMatch(/font-semibold/);
  });

  it("sans query : rendu inchangé ; la région status n'annonce rien de visible", () => {
    render(<CountBar total={0} loaded={0} noun={NOUN} />);
    const bar = document.querySelector("[data-slot='count-bar']") as HTMLElement;
    expect(bar).not.toHaveTextContent("résultat");
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("version compacte (kanban) : le total seul", () => {
    render(<CountBar total={142} loaded={30} noun={NOUN} filterLabel="3 en retard" compact />);
    const bar = document.querySelector("[data-slot='count-bar']") as HTMLElement;
    expect(bar).toHaveTextContent("142");
    expect(bar).not.toHaveTextContent("chargées");
    expect(bar).not.toHaveTextContent("en retard");
  });

  it("atténuée et occupée pendant une recherche en cours", () => {
    render(<CountBar total={1000} loaded={50} noun={NOUN} busy />);
    const bar = document.querySelector("[data-slot='count-bar']") as HTMLElement;
    expect(bar).toHaveAttribute("aria-busy", "true");
    expect(bar.className).toMatch(/opacity-/);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("CountBar : région d'état", () => {
  const status = () => screen.getByRole("status");

  it("une seule région role=status, polie et atomique, vide à l'ouverture", () => {
    render(<CountBar total={1000} loaded={50} noun={NOUN} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(status()).toHaveAttribute("aria-live", "polite");
    expect(status()).toHaveAttribute("aria-atomic", "true");
    expect(status()).toHaveTextContent("");
  });

  it("annonce l'arrivée d'une page : « 50 fonctionnalités de plus chargées · 100 sur 1 000 »", () => {
    const { rerender } = render(<CountBar total={1000} loaded={50} noun={NOUN} />);
    rerender(<CountBar total={1000} loaded={100} noun={NOUN} />);
    expect(status()).toHaveTextContent("50 fonctionnalités de plus chargées · 100 sur 1 000");
  });

  it("ne déplace jamais le focus", () => {
    const { rerender } = render(
      <>
        <button type="button">Ligne active</button>
        <CountBar total={1000} loaded={50} noun={NOUN} />
      </>,
    );
    screen.getByRole("button").focus();
    rerender(
      <>
        <button type="button">Ligne active</button>
        <CountBar total={1000} loaded={100} noun={NOUN} />
      </>,
    );
    expect(screen.getByRole("button")).toHaveFocus();
    expect(status()).not.toHaveAttribute("tabindex");
  });

  it("n'annonce pas un nouveau total (autre recherche) comme une page reçue", () => {
    const { rerender } = render(<CountBar total={1000} loaded={50} noun={NOUN} />);
    rerender(<CountBar total={12} loaded={12} noun={NOUN} />);
    expect(status()).toHaveTextContent("");
  });

  it("le message explicite de l'écran l'emporte (recherche, fin, chargement)", () => {
    const { rerender } = render(
      <CountBar
        total={1000}
        loaded={50}
        noun={NOUN}
        announcement="Chargement des fonctionnalités…"
      />,
    );
    expect(status()).toHaveTextContent("Chargement des fonctionnalités…");
    rerender(
      <CountBar
        total={12}
        loaded={12}
        noun={NOUN}
        announcement="12 fonctionnalités trouvées sur 1 000"
      />,
    );
    expect(status()).toHaveTextContent("12 fonctionnalités trouvées sur 1 000");
  });

  it("le texte visible n'est pas dans la région d'état (pas de relecture complète de la barre)", () => {
    render(<CountBar total={1000} loaded={50} noun={NOUN} sort="identifiant" />);
    expect(status()).not.toHaveTextContent("Tri");
    expect(status().className).toMatch(/sr-only/);
  });
});

describe("CountBar : écarts de la planche 12 l.53", () => {
  it("8 entre le résumé et le tri, 8 entre « Tri » et l'icône", () => {
    const { container } = render(<CountBar total={3} loaded={3} noun={NOUN} sort="identifiant" />);
    expect(container.firstElementChild).toHaveClass("gap-x-2");
    expect(container.querySelector("[data-slot='count-bar-sort']")).toHaveClass("gap-2");
  });
});

describe("CountBar : showAllLoaded (TK-103)", () => {
  it("écrit « toutes chargées » ou « tous chargés » une fois la liste chargée", () => {
    const { rerender, container } = render(
      <CountBar total={4} loaded={4} noun={NOUN} showAllLoaded />,
    );
    expect(container).toHaveTextContent("· toutes chargées");
    rerender(<CountBar total={4} loaded={4} noun={{ ...NOUN, masculine: true }} showAllLoaded />);
    expect(container).toHaveTextContent("· tous chargés");
    rerender(<CountBar total={4} loaded={2} noun={NOUN} showAllLoaded />);
    expect(container).not.toHaveTextContent("toutes chargées");
    rerender(<CountBar total={4} loaded={4} noun={NOUN} />);
    expect(container).not.toHaveTextContent("toutes chargées");
  });
});

describe("CountBar : trailing (TK-107)", () => {
  it("place le contenu à droite de la même rangée, hors de la région d'état", () => {
    render(
      <CountBar
        total={6}
        loaded={6}
        noun={{ one: "table", other: "tables" }}
        trailing={<input aria-label="Rechercher" />}
      />,
    );
    const slot = document.querySelector("[data-slot='count-bar-trailing']");
    expect(slot).toHaveClass("ml-auto");
    expect(slot?.querySelector("input")).not.toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
