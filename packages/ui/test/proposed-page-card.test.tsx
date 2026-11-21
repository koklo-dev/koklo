// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProposedPageCard } from "../src/index.ts";

/** TK-111 lot C : variante « section » de `ProposedPageCard` (DESIGN.md §5.22, maquette 13 l.256-262). */
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
});
