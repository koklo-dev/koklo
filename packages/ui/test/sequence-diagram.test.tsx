// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SequenceDiagram, type SequenceItem } from "../src/index.ts";

/** TK-112 lot B : diagramme de séquence d'un flux (DESIGN.md §5.23, maquette 13 l.814-835). */
const PARTICIPANTS = [
  { id: "RL-client", name: "Client", type: "actor" },
  { id: "C-portail", name: "Portail", type: "app" },
  { id: "C-api", name: "API", type: "service" },
  { id: "C-sms", name: "SMS", type: "ext" },
] as const;
const ITEMS: SequenceItem[] = [
  { kind: "message", from: "RL-client", to: "C-portail", text: "Choisit un créneau" },
  {
    kind: "message",
    from: "C-portail",
    to: "C-api",
    text: "reservation.create",
    reply: "Confirmée",
  },
  {
    kind: "alt",
    label: "sinon · créneau pris",
    messages: [{ from: "C-portail", to: "C-api", text: "Réessaie", error: "409 conflit" }],
  },
  { kind: "separator", label: "La veille à 18 h" },
  { kind: "message", from: "C-api", to: "C-sms", text: "Envoie le SMS" },
];

function diagram(items: SequenceItem[] = ITEMS) {
  return render(<SequenceDiagram title="Réserver" participants={PARTICIPANTS} items={items} />);
}
const arrows = (kind: string) => document.querySelectorAll(`[data-arrow='${kind}']`);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("SequenceDiagram", () => {
  it("est une image « Diagramme de séquence X, N messages » (appels, retours et échecs comptés)", () => {
    diagram();
    expect(
      screen.getByRole("img", { name: "Diagramme de séquence Réserver, 6 messages" }),
    ).toBeVisible();
  });

  it("trace les appels pleins, les retours pointillés et l'échec en rouge", () => {
    diagram();
    expect(arrows("call")).toHaveLength(4);
    expect(arrows("reply")).toHaveLength(1);
    expect(arrows("error")).toHaveLength(1);
    for (const line of arrows("call")) expect(line.getAttribute("stroke-dasharray")).toBeNull();
    expect(arrows("reply")[0]?.getAttribute("stroke-dasharray")).toBe("5 4");
    expect(arrows("error")[0]?.getAttribute("class")).toContain("stroke-destructive");
  });

  it("dessine un cadre alt (jetons --destructive) et son libellé, puis le séparateur", () => {
    const { container } = diagram();
    expect(container.querySelector("rect")?.getAttribute("class")).toContain("fill-destructive");
    expect(screen.getByText("sinon · créneau pris").getAttribute("data-slot")).toBe("sequence-alt");
    expect(screen.getByText("La veille à 18 h").getAttribute("data-slot")).toBe(
      "sequence-separator",
    );
  });

  it("en-têtes : pilule pour l'acteur, pointillé pour l'externe, une ligne de vie par participant", () => {
    const { container } = diagram();
    const heads = [...container.querySelectorAll("[data-slot='sequence-head']")];
    expect(heads).toHaveLength(4);
    expect(heads[0]?.className).toContain("rounded-full");
    expect(heads[3]?.className).toContain("border-dashed");
    expect(container.querySelectorAll("svg line:not([data-arrow])")).toHaveLength(4);
  });

  it("au-delà de 6 participants le dessin s'élargit : deux en-têtes ne se chevauchent jamais", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `C-${i}`,
      name: `Service ${i}`,
      type: "service" as const,
    }));
    const { container } = render(<SequenceDiagram title="Large" participants={many} items={[]} />);
    const lefts = [...container.querySelectorAll<HTMLElement>("[data-slot='sequence-head']")].map(
      (head) => Number.parseFloat(head.style.left),
    );
    for (let i = 1; i < lefts.length; i += 1) {
      expect((lefts[i] ?? 0) - (lefts[i - 1] ?? 0)).toBeGreaterThanOrEqual(132);
    }
    expect(screen.getByRole("img", { name: /Large/ })).toHaveStyle({ width: "1176px" });
  });

  it("numérote les messages en mono 10", () => {
    diagram();
    expect(screen.getByText("1.")).toHaveClass("font-mono");
    expect(screen.getByText("6.")).toBeVisible();
  });

  it("« Lire les messages » : liste numérotée de tous les messages, échec signalé en texte", () => {
    diagram();
    const details = screen.getByText("Lire les messages").closest("details") as HTMLElement;
    const items = within(details).getAllByRole("listitem", { hidden: true });
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent("Client vers Portail : Choisit un créneau");
    expect(items[2]).toHaveTextContent("API vers Portail : Retour : Confirmée");
    expect(items[4]).toHaveTextContent("Échec : 409 conflit");
    expect(details.querySelector("ol")).not.toBeNull();
  });

  it("le cadre défile à l'horizontale : région focusable et nommée", () => {
    diagram();
    const region = screen.getByRole("region", { name: /défilement horizontal/ });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("rend le texte du modèle en texte brut (pas de HTML)", () => {
    diagram([{ kind: "message", from: "RL-client", to: "C-api", text: "<b>gras</b>" }]);
    expect(screen.getAllByText("<b>gras</b>").length).toBeGreaterThan(0);
    expect(document.querySelector("b")).toBeNull();
  });

  it("un seul participant ne plante pas", () => {
    render(<SequenceDiagram title="Seul" participants={[PARTICIPANTS[0]]} items={[]} />);
    expect(
      screen.getByRole("img", { name: "Diagramme de séquence Seul, 0 message" }),
    ).toBeVisible();
  });
});
