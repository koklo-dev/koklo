// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProposedPageCard, ProposedPageList } from "../src/index.ts";

const MARGINS = ["mt-3.5", "mx-0.5", "mb-2.5"];

/** TK-111 lot C : variante « section » de `ProposedPageCard` (DESIGN.md §5.22, maquette 13 l.256-262). */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ProposedPageCard", () => {
  const base = { title: "Observabilité", rationale: "NFR-005 demande une alerte." };

  it("par défaut : page proposée, « Ajouter la page »", () => {
    render(<ProposedPageCard {...base} onAccept={() => undefined} onIgnore={() => undefined} />);
    expect(screen.getByRole("group", { name: "Page proposée par l'agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter la page" })).toBeInTheDocument();
  });

  it("label « section » : nom du groupe, bouton et marges 14 px haut, 2 px côtés", () => {
    const onAccept = vi.fn();
    const onIgnore = vi.fn();
    render(<ProposedPageCard {...base} label="section" onAccept={onAccept} onIgnore={onIgnore} />);
    const group = screen.getByRole("group", { name: "Section proposée par l'agent" });
    expect(group.className).toMatch(/mt-3\.5/);
    expect(group.className).toMatch(/mx-0\.5/);
    expect(group.className).toMatch(/border-dashed/);
    expect(group.className).toMatch(/bg-diff-bg/);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter la section" }));
    fireEvent.click(screen.getByRole("button", { name: "Ignorer" }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onIgnore).toHaveBeenCalledOnce();
  });

  it("marges 14 / 2 / 10 par défaut (maquette 06 l.89), sans marge basse pour une section", () => {
    const { rerender } = render(
      <ProposedPageCard {...base} onAccept={() => undefined} onIgnore={() => undefined} />,
    );
    const page = screen.getByRole("group", { name: "Page proposée par l'agent" });
    expect(MARGINS.every((c) => page.classList.contains(c))).toBe(true);
    rerender(
      <ProposedPageCard
        {...base}
        label="section"
        onAccept={() => undefined}
        onIgnore={() => undefined}
      />,
    );
    const section = screen.getByRole("group", { name: "Section proposée par l'agent" });
    expect(["mt-3.5", "mx-0.5"].every((c) => section.classList.contains(c))).toBe(true);
    expect(section.classList.contains("mb-2.5")).toBe(false);
  });

  it("liste de 3 cartes : le conteneur porte les marges, aucune carte n'en porte", () => {
    const items = [1, 2, 3].map((n) => ({ id: `p${n}`, title: `Page ${n}`, rationale: "r" }));
    render(
      <ProposedPageList items={items} onAccept={() => undefined} onIgnore={() => undefined} />,
    );
    const cards = screen.getAllByRole("group", { name: "Page proposée par l'agent" });
    expect(cards).toHaveLength(3);
    const container = cards[0]?.parentElement as HTMLElement;
    expect(MARGINS.every((c) => container.classList.contains(c))).toBe(true);
    for (const card of cards) {
      expect(card.classList.contains("m-0")).toBe(true);
      expect(card.classList.contains("mt-3.5")).toBe(false);
      expect(card.classList.contains("mb-2.5")).toBe(false);
    }
  });
});

describe("ProposedPageCard : résumé client (TK-117, maquette 15 l.207)", () => {
  it("« Proposition de l'agent » avec son texte, « Accepter » et « Rejeter »", () => {
    render(
      <ProposedPageCard
        label="summary"
        title="Proposition de l'agent · résumé client"
        rationale="suite au changement"
        onAccept={() => undefined}
        onIgnore={() => undefined}
      >
        <p>Nouveau texte.</p>
      </ProposedPageCard>,
    );
    const card = screen.getByRole("group", { name: "Proposition de l'agent" });
    expect(card).toHaveTextContent("Nouveau texte.");
    expect(screen.getByRole("button", { name: "Accepter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rejeter" })).toBeInTheDocument();
  });
});
