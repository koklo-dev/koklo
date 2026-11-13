// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DiagramNode, DiagramViewer, ErTableCard, type ErTableField } from "../src/index.ts";
import { DESKTOP, MOBILE, setViewport } from "./viewport.ts";

/** TK-108 lot A : lecteur de diagramme SVG (DESIGN.md §5.19, maquette 11 l.168-206, 398-412, 455-469). */
interface TableNode extends DiagramNode {
  fields: readonly ErTableField[];
  state?: "review" | "rejected";
}
const FIELDS: readonly ErTableField[] = [
  { name: "id", type: "uuid", kind: "primary" },
  { name: "client_id", type: "ref(T-client)", kind: "reference" },
];
const NODES: readonly TableNode[] = [
  { id: "T-client", name: "Client", width: 230, height: 92, fields: FIELDS },
  { id: "T-reservation", name: "Réservation", width: 230, height: 92, fields: FIELDS },
  { id: "T-rappel", name: "Rappel", width: 230, height: 92, fields: FIELDS, state: "review" },
];
const RELATIONS = [
  { id: "r1", from: "T-client", to: "T-reservation", label: "1 → n" },
  { id: "r2", from: "T-reservation", to: "T-rappel", label: "n ↔ n", dashed: true },
];
const POSITIONS = {
  "T-client": { x: 20, y: 20 },
  "T-reservation": { x: 300, y: 20 },
  "T-rappel": { x: 580, y: 20 },
};

type Props = Partial<Parameters<typeof DiagramViewer<TableNode>>[0]>;
function viewer(props: Props = {}) {
  return render(
    <DiagramViewer<TableNode>
      label="Diagramme entité-relation"
      nodes={NODES}
      relations={RELATIONS}
      positions={POSITIONS}
      renderNode={(node, ctx) => (
        <ErTableCard
          id={node.id}
          name={node.name}
          fields={node.fields}
          state={node.state}
          {...ctx}
        />
      )}
      {...props}
    />,
  );
}
const region = () => screen.getByRole("region", { name: "Diagramme entité-relation" });
const status = () => screen.getByRole("status");
const node = (name: string) => screen.getByRole("button", { name: new RegExp(`^Table ${name},`) });
const zoomBar = () => screen.getByRole("toolbar", { name: "Zoom du diagramme" });

function mockSize(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height);
}
function drag(target: HTMLElement, from: [number, number], to: [number, number]) {
  const mouse = (type: string, [clientX, clientY]: [number, number]) =>
    new MouseEvent(type, { bubbles: true, clientX, clientY, button: 0 });
  fireEvent(target, mouse("pointerdown", from));
  fireEvent(window, mouse("pointermove", to));
  fireEvent(window, mouse("pointerup", to));
}

afterEach(() => {
  vi.restoreAllMocks();
  setViewport(DESKTOP);
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("DiagramViewer", () => {
  it("offre une région focusable nommée, un SVG masqué, un statut et une barre de zoom", () => {
    const { container } = viewer();
    expect(region()).toHaveAttribute("tabindex", "0");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(status()).toHaveTextContent("Zoom 100 %");
    const bar = within(zoomBar());
    for (const name of ["Dézoomer", /revenir à 100 %$/, "Zoomer", "Ajuster à l'écran"]) {
      expect(bar.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("pose la trame de points (pas 20) sur un cadre arrondi à fond --surface", () => {
    const { container } = viewer();
    const frame = container.querySelector("[data-slot='diagram-viewer']");
    expect(frame?.className).toContain("bg-surface");
    expect(frame?.className).toContain("rounded-xl");
    expect(frame?.className).toContain("radial-gradient(var(--border)_1px,transparent_1px)");
    expect(frame?.className).toContain("bg-[length:20px_20px]");
  });

  it("rend chaque table en button aria-pressed, dans l'ordre des identifiants", () => {
    viewer({ nodes: [...NODES].reverse() });
    const buttons = screen.getAllByRole("button", { name: /^Table / });
    expect(
      buttons.map((b) => b.closest("[data-slot='er-table-card']")?.getAttribute("data-spec-id")),
    ).toEqual(["T-client", "T-rappel", "T-reservation"]);
    expect(node("Réservation")).toHaveAccessibleName("Table Réservation, 2 champs");
    expect(node("Réservation")).toHaveAttribute("aria-pressed", "false");
  });

  it("place les cartes aux positions imposées", () => {
    viewer();
    const wrapper = node("Réservation").closest("[data-slot='diagram-node']") as HTMLElement;
    expect(wrapper.style.left).toBe("300px");
    expect(wrapper.style.top).toBe("20px");
    expect(wrapper.style.width).toBe("230px");
  });

  it("Tab puis Entrée sélectionnent une table", async () => {
    const onSelect = vi.fn();
    viewer({ onSelect });
    const user = userEvent.setup();
    await user.tab();
    expect(region()).toHaveFocus();
    await user.tab();
    expect(node("Client")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("T-client");
  });

  it("la table sélectionnée est aria-pressed et ses relations passent en --primary 2 px", () => {
    const { container } = viewer({ selectedId: "T-client" });
    expect(node("Client")).toHaveAttribute("aria-pressed", "true");
    expect(node("Réservation")).toHaveAttribute("aria-pressed", "false");
    const lines = container.querySelectorAll("svg line");
    const linked = container.querySelector("line[data-relation='r1']");
    const other = container.querySelector("line[data-relation='r2']");
    expect(lines).toHaveLength(2);
    expect(linked?.getAttribute("class")).toContain("stroke-primary");
    expect(linked?.getAttribute("stroke-width")).toBe("2");
    expect(other?.getAttribute("class")).toContain("stroke-border-strong");
    expect(other?.getAttribute("stroke-width")).toBe("1.5");
  });

  it("trace les relations entre centres, en pointillés « 5 4 » pour les n ↔ n", () => {
    const { container } = viewer();
    const plain = container.querySelector("line[data-relation='r1']");
    expect(plain?.getAttribute("x1")).toBe("135");
    expect(plain?.getAttribute("y1")).toBe("66");
    expect(plain?.getAttribute("x2")).toBe("415");
    expect(plain?.hasAttribute("stroke-dasharray")).toBe(false);
    expect(container.querySelector("line[data-relation='r2']")).toHaveAttribute(
      "stroke-dasharray",
      "5 4",
    );
  });

  it("écrit la cardinalité en mono 11 sur chaque relation, masquée aux lecteurs d'écran", () => {
    viewer();
    const label = screen.getByText("1 → n", { ignore: "[role='status']" });
    expect(label.className).toContain("font-mono");
    expect(label.className).toContain("bg-background");
    expect(label.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("zoome par paliers avec les boutons et annonce le pourcentage", async () => {
    const onZoomChange = vi.fn();
    viewer({ onZoomChange });
    const user = userEvent.setup();
    const bar = within(zoomBar());
    await user.click(bar.getByRole("button", { name: "Zoomer" }));
    expect(status()).toHaveTextContent("Zoom 110 %");
    expect(onZoomChange).toHaveBeenLastCalledWith(1.1);
    await user.click(bar.getByRole("button", { name: "Dézoomer" }));
    await user.click(bar.getByRole("button", { name: "Dézoomer" }));
    expect(status()).toHaveTextContent("Zoom 90 %");
    await user.click(bar.getByRole("button", { name: /revenir à 100 %$/ }));
    expect(status()).toHaveTextContent("Zoom 100 %");
    expect(bar.getByRole("button", { name: /revenir à 100 %$/ })).toHaveTextContent("100 %");
    expect(bar.getByRole("button", { name: "100 %, revenir à 100 %" })).toBeInTheDocument();
  });

  it("s'arrête à 50 % et à 200 %", async () => {
    viewer();
    const user = userEvent.setup();
    const bar = within(zoomBar());
    for (let i = 0; i < 8; i++) await user.click(bar.getByRole("button", { name: "Dézoomer" }));
    expect(status()).toHaveTextContent("Zoom 50 %");
    for (let i = 0; i < 12; i++) await user.click(bar.getByRole("button", { name: "Zoomer" }));
    expect(status()).toHaveTextContent("Zoom 200 %");
  });

  it("Ctrl ou ⌘ + « + », « − » et « 0 » zooment quand le lecteur a le focus", async () => {
    viewer();
    const user = userEvent.setup();
    region().focus();
    await user.keyboard("{Control>}+{/Control}");
    expect(status()).toHaveTextContent("Zoom 110 %");
    await user.keyboard("{Meta>}-{/Meta}");
    expect(status()).toHaveTextContent("Zoom 100 %");
    await user.keyboard("{Control>}-{/Control}");
    expect(status()).toHaveTextContent("Zoom 90 %");
    await user.keyboard("{Control>}0{/Control}");
    expect(status()).toHaveTextContent("Zoom 100 %");
    await user.keyboard("+");
    expect(status()).toHaveTextContent("Zoom 100 %");
  });

  it("Ctrl + molette zoome (écouteur non passif, défilement de la page empêché) ; la molette seule ne fait rien", () => {
    viewer();
    const wheelUp = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    });
    act(() => {
      region().dispatchEvent(wheelUp);
    });
    expect(wheelUp.defaultPrevented).toBe(true);
    expect(status()).toHaveTextContent("Zoom 110 %");
    const plain = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });
    act(() => {
      region().dispatchEvent(plain);
    });
    expect(plain.defaultPrevented).toBe(false);
    expect(status()).toHaveTextContent("Zoom 110 %");
    const wheelDown = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
      deltaY: 100,
    });
    act(() => {
      region().dispatchEvent(wheelDown);
    });
    expect(status()).toHaveTextContent("Zoom 100 %");
  });

  it("« Ajuster » prend le plus petit rapport largeur / hauteur utiles sur le plan", async () => {
    mockSize(600, 400);
    viewer();
    await userEvent.setup().click(screen.getByRole("button", { name: "Ajuster à l'écran" }));
    // plan : 580 + 230 + 20 = 830 de large, 20 + 92 + 20 = 132 de haut → min(0,72 ; 3,03)
    expect(status()).toHaveTextContent("Zoom 72 %");
  });

  it('s\'ouvre en « Ajuster » avec initialZoom="fit"', () => {
    mockSize(600, 400);
    viewer({ initialZoom: "fit" });
    expect(status()).toHaveTextContent("Zoom 72 %");
  });

  it("accepte un zoom initial en palier", () => {
    viewer({ initialZoom: 1.5 });
    expect(status()).toHaveTextContent("Zoom 150 %");
  });

  it("sous 60 % de zoom les champs disparaissent mais le nom garde « N champs »", async () => {
    viewer({ initialZoom: 0.67 });
    expect(document.querySelectorAll("[data-slot='er-field']")).toHaveLength(6);
    await userEvent.setup().click(screen.getByRole("button", { name: "Dézoomer" }));
    expect(status()).toHaveTextContent("Zoom 50 %");
    expect(document.querySelectorAll("[data-slot='er-field']")).toHaveLength(0);
    expect(node("Réservation")).toHaveAccessibleName("Table Réservation, 2 champs");
  });

  it("le glisser appelle onMove avec la position finale (divisée par le zoom)", () => {
    const onMove = vi.fn();
    viewer({ onMove });
    drag(node("Client"), [100, 100], [160, 130]);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith("T-client", { x: 80, y: 50 }, expect.anything());
    expect(status()).toHaveTextContent("Client déplacée");
  });

  it("à 200 % le glisser est converti dans le plan", () => {
    const onMove = vi.fn();
    viewer({ onMove, initialZoom: 2 });
    drag(node("Client"), [100, 100], [160, 130]);
    expect(onMove).toHaveBeenCalledWith("T-client", { x: 50, y: 35 }, expect.anything());
  });

  it("un simple clic (moins de 4 px) sélectionne sans déplacer", async () => {
    const onMove = vi.fn();
    const onSelect = vi.fn();
    viewer({ onMove, onSelect });
    drag(node("Client"), [100, 100], [101, 101]);
    expect(onMove).not.toHaveBeenCalled();
    await userEvent.setup().click(node("Client"));
    expect(onSelect).toHaveBeenCalledWith("T-client");
  });

  it("ne glisse pas sans onMove (lecture seule : designer)", () => {
    viewer();
    drag(node("Client"), [100, 100], [160, 130]);
    const wrapper = node("Client").closest("[data-slot='diagram-node']") as HTMLElement;
    expect(wrapper.style.left).toBe("20px");
  });

  it("ne glisse pas sous 768 px", () => {
    setViewport(MOBILE);
    const onMove = vi.fn();
    viewer({ onMove });
    drag(node("Client"), [100, 100], [160, 130]);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("Alt + flèches déplacent la table focalisée de 20 px (WCAG 2.5.7)", async () => {
    const onMove = vi.fn();
    viewer({ onMove });
    const user = userEvent.setup();
    node("Réservation").focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(onMove).toHaveBeenLastCalledWith("T-reservation", { x: 320, y: 20 }, expect.anything());
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(onMove).toHaveBeenLastCalledWith("T-reservation", { x: 320, y: 40 }, expect.anything());
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(onMove).toHaveBeenLastCalledWith("T-reservation", { x: 300, y: 40 }, expect.anything());
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(onMove).toHaveBeenLastCalledWith("T-reservation", { x: 300, y: 20 }, expect.anything());
    expect(status()).toHaveTextContent("Réservation déplacée");
  });

  it("garde Alt + flèches sous 768 px, ne sort jamais du plan (x et y >= 0) et se tait sans onMove", async () => {
    setViewport(MOBILE);
    const onMove = vi.fn();
    const { unmount } = viewer({
      onMove,
      positions: { ...POSITIONS, "T-client": { x: 10, y: 5 } },
    });
    const user = userEvent.setup();
    node("Client").focus();
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(onMove).toHaveBeenLastCalledWith("T-client", { x: 0, y: 5 }, expect.anything());
    unmount();
    const silent = vi.fn();
    viewer();
    node("Client").focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(silent).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent("Zoom 100 %");
  });

  it("une flèche seule ne déplace rien", async () => {
    const onMove = vi.fn();
    viewer({ onMove });
    node("Client").focus();
    await userEvent.setup().keyboard("{ArrowRight}");
    expect(onMove).not.toHaveBeenCalled();
  });

  it("agrandit les boutons de zoom à 44 px sous 768 px (classe max-md)", () => {
    viewer();
    const button = within(zoomBar()).getByRole("button", { name: "Zoomer" });
    expect(button.className).toContain("size-[30px]");
    expect(button.className).toContain("max-md:size-11");
  });

  it("place les tables par dagre quand aucune position n'est donnée", () => {
    viewer({ positions: undefined });
    const left = (name: string) =>
      Number.parseInt(
        (node(name).closest("[data-slot='diagram-node']") as HTMLElement).style.left,
        10,
      );
    expect(left("Client")).toBeLessThan(left("Réservation"));
  });

  it("n'affiche aucune relation vers une table absente", () => {
    const { container } = viewer({
      relations: [{ id: "x", from: "T-client", to: "T-absente", label: "1 → n" }],
    });
    expect(container.querySelectorAll("svg line")).toHaveLength(0);
  });
});

/** B478 : mini-carte du lecteur (DESIGN.md §5.3, schéma 1.3) et traits pondérés entre zones. */
describe("DiagramViewer, mini-carte et traits pondérés", () => {
  it("mini-carte : un rectangle par nœud, le choisi en --primary", () => {
    viewer({ minimap: true, selectedId: "T-client" });
    const map = screen.getByRole("button", { name: /^Mini-carte du diagramme/ });
    const boxes = map.querySelectorAll("[data-minimap-node]");
    expect(boxes).toHaveLength(3);
    expect([...boxes].filter((box) => box.classList.contains("bg-primary"))).toHaveLength(1);
  });

  it("sans `minimap` : pas de mini-carte", () => {
    viewer();
    expect(screen.queryByRole("button", { name: /^Mini-carte du diagramme/ })).toBeNull();
  });

  it("`weight` règle l'épaisseur, `labelFont: sans` l'étiquette en texte courant", () => {
    viewer({
      relations: [
        {
          id: "z",
          from: "T-client",
          to: "T-rappel",
          label: "4 relations",
          weight: 3,
          labelFont: "sans",
        },
      ],
    });
    expect(document.querySelector("line[data-relation='z']")).toHaveAttribute("stroke-width", "3");
    expect(screen.getByText("4 relations")).toHaveClass("text-caption");
    expect(screen.getByText("4 relations")).not.toHaveClass("font-mono");
  });

  it("`fullscreen` : bouton bascule « Plein écran » dans la barre de zoom (B479)", async () => {
    const onToggle = vi.fn();
    viewer({ fullscreen: { active: false, onToggle } });
    const button = within(zoomBar()).getByRole("button", { name: "Plein écran" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("onMove reçoit aussi le plan de toute la vue après le déplacement (B481)", async () => {
    const onMove = vi.fn();
    viewer({ onMove });
    node("Réservation").focus();
    await userEvent.setup().keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(onMove.mock.calls[0]?.[2]).toEqual({
      "T-client": { x: 20, y: 20 },
      "T-reservation": { x: 320, y: 20 },
      "T-rappel": { x: 580, y: 20 },
    });
  });
});
