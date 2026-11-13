// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DiagramMinimap, ZoneNode } from "../src/index.ts";

/**
 * TK-94 lot B (passation 07 §1.3, DESIGN.md v2.1 §5.3) : `ZoneNode` et `DiagramMinimap` (schéma 1.3).
 * Les écrans arrivent au lot 6 : ici, rendu, ARIA et interactions.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ZoneNode", () => {
  const zone = { name: "Réservation", icon: "table", count: 14, countLabel: "tables" } as const;

  it("bouton nommé « Zone Réservation 14 tables » contenant son libellé visible", () => {
    render(<ZoneNode {...zone} onOpen={() => undefined} />);
    const button = screen.getByRole("button", { name: "Zone Réservation 14 tables" });
    expect(button).toHaveTextContent("Réservation");
    expect(button).toHaveTextContent("14 tables");
  });

  it("Label in Name (2.5.3) : le texte visible du bouton est contenu dans son nom, aperçu et liens en dehors", () => {
    render(
      <ZoneNode {...zone} preview={["reservation"]} links="→ 3 liens" onOpen={() => undefined} />,
    );
    const button = screen.getByRole("button");
    const name = button.getAttribute("aria-label") ?? "";
    expect(name).toContain(zone.name);
    expect(name).toContain("14 tables");
    expect(button).not.toHaveTextContent("reservation");
    expect(button).not.toHaveTextContent("liens");
  });

  it("cadre pointillé --border-strong, icône décorative", () => {
    render(<ZoneNode {...zone} onOpen={() => undefined} />);
    const node = document.querySelector("[data-slot='zone-node']") as HTMLElement;
    expect(node.className).toMatch(/border-dashed/);
    expect(node.className).toMatch(/border-border-strong/);
    expect(node.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("aperçu : au plus 4 noms de tables puis le reste", () => {
    render(
      <ZoneNode
        {...zone}
        preview={["reservation", "creneau", "annulation", "salle", "horaire", "groupe"]}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText("reservation")).toBeVisible();
    expect(screen.getByText("salle")).toBeVisible();
    expect(screen.queryByText("horaire")).toBeNull();
    expect(screen.getByText("+2")).toBeVisible();
  });

  it("résumé des liens sortants", () => {
    render(
      <ZoneNode {...zone} links="→ 12 liens vers Clients, Paiement…" onOpen={() => undefined} />,
    );
    expect(screen.getByText("→ 12 liens vers Clients, Paiement…")).toBeVisible();
  });

  it("clic, Entrée et Espace ouvrent la zone", async () => {
    const onOpen = vi.fn();
    render(<ZoneNode {...zone} onOpen={onOpen} />);
    const button = screen.getByRole("button");
    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it("singulier : « 1 table »", () => {
    render(<ZoneNode {...zone} count={1} countLabel="table" onOpen={() => undefined} />);
    expect(screen.getByRole("button", { name: "Zone Réservation 1 table" })).toBeVisible();
  });

  it("zone courante : aria-pressed", () => {
    render(<ZoneNode {...zone} current onOpen={() => undefined} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("DiagramMinimap", () => {
  const props = {
    world: { width: 1400, height: 700 },
    nodes: [
      { id: "z1", x: 0, y: 0, width: 400, height: 200 },
      { id: "z2", x: 600, y: 300, width: 400, height: 200, active: true },
    ],
    viewport: { x: 100, y: 50, width: 700, height: 350 },
  };

  it("150 px de large, bouton nommé, en bas à gauche", () => {
    render(<DiagramMinimap {...props} onNavigate={() => undefined} />);
    const map = screen.getByRole("button", { name: /Mini-carte du diagramme/ });
    expect(map).toHaveStyle({ width: "150px" });
    expect(map).toHaveStyle({ height: "75px" });
    expect(document.querySelector("[data-slot='diagram-minimap']")?.className).toMatch(
      /absolute|bottom-/,
    );
  });

  it("plan haut : hauteur bornée à 154 px, largeur réduite d'autant", () => {
    render(
      <DiagramMinimap
        {...props}
        world={{ width: 600, height: 1800 }}
        onNavigate={() => undefined}
      />,
    );
    const map = screen.getByRole("button", { name: /Mini-carte du diagramme/ });
    expect(map).toHaveStyle({ width: "51px", height: "154px" });
  });

  it("un rectangle par nœud, la zone active en --primary, les autres en --border-strong", () => {
    render(<DiagramMinimap {...props} onNavigate={() => undefined} />);
    const nodes = document.querySelectorAll("[data-minimap-node]");
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.className).toMatch(/bg-border-strong/);
    expect(nodes[1]?.className).toMatch(/bg-primary/);
  });

  it("cadre de la vue en --primary, à l'échelle de la mini-carte", () => {
    render(<DiagramMinimap {...props} onNavigate={() => undefined} />);
    const frame = document.querySelector("[data-minimap-viewport]") as HTMLElement;
    expect(frame.className).toMatch(/border-primary/);
    const scale = 150 / 1400;
    // jsdom sérialise les longueurs avec 6 chiffres significatifs : on compare les valeurs numériques.
    const px = (name: "left" | "top" | "width" | "height") => Number.parseFloat(frame.style[name]);
    expect(px("left")).toBeCloseTo(100 * scale, 3);
    expect(px("top")).toBeCloseTo(50 * scale, 3);
    expect(px("width")).toBeCloseTo(700 * scale, 3);
    expect(px("height")).toBeCloseTo(350 * scale, 3);
  });

  it("un clic demande à centrer la vue sur le point cliqué (coordonnées du diagramme)", () => {
    const onNavigate = vi.fn();
    render(<DiagramMinimap {...props} onNavigate={onNavigate} />);
    const map = screen.getByRole("button", { name: /Mini-carte/ });
    map.getBoundingClientRect = () => ({
      left: 10,
      top: 20,
      width: 150,
      height: 75,
      right: 160,
      bottom: 95,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    fireEvent.click(map, { clientX: 10 + 75, clientY: 20 + 37.5, detail: 1 });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    const point = onNavigate.mock.calls[0]?.[0];
    expect(point.x).toBeCloseTo(700, 0);
    expect(point.y).toBeCloseTo(350, 0);
  });

  it("au clavier, les flèches déplacent la vue d'un dixième du diagramme", async () => {
    const onNavigate = vi.fn();
    render(<DiagramMinimap {...props} onNavigate={onNavigate} />);
    screen.getByRole("button", { name: /Mini-carte/ }).focus();
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    // centre de la vue : (450, 225)
    expect(onNavigate.mock.calls[0]?.[0]).toEqual({ x: 450 + 140, y: 225 });
    expect(onNavigate.mock.calls[1]?.[0]).toEqual({ x: 450, y: 225 + 70 });
  });
});

/** B478 : variante du diagramme des Données (maquette 11) : 7 noms d'aperçu, flèche, détail dans le nom accessible. */
describe("ZoneNode, variante Données", () => {
  it("previewLimit, detail et arrow", () => {
    const names = Array.from({ length: 9 }, (_, i) => `t${i}`);
    render(
      <ZoneNode
        name="Paiement"
        icon="folder_open"
        count={9}
        countLabel="tables"
        preview={names}
        previewLimit={7}
        detail="cliquez pour ouvrir"
        arrow
        onOpen={() => undefined}
      />,
    );
    const button = screen.getByRole("button", {
      name: "Zone Paiement 9 tables · cliquez pour ouvrir",
    });
    expect(button).toHaveTextContent("9 tables · cliquez pour ouvrir");
    expect(screen.getByText("t6")).toBeInTheDocument();
    expect(screen.queryByText("t7")).toBeNull();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});
