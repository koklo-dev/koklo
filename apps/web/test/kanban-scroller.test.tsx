import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KanbanScroller } from "../src/components/kanban-scroller.tsx";

/** D8 (passation 01 §1.6) : le kanban coupé à droite sans indice reçoit un défilement visible et une ombre de bord. */
function measure(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
}
const region = () => screen.getByRole("region", { name: "Colonnes du kanban" });
const edge = (side: "start" | "end") => document.querySelector(`[data-edge="${side}"]`);

function scrollTo(left: number) {
  Object.defineProperty(region(), "scrollLeft", { configurable: true, value: left });
  fireEvent.scroll(region());
}

afterEach(() => vi.restoreAllMocks());

describe("KanbanScroller : défilement horizontal visible et ombre de bord", () => {
  it("région défilante atteignable au clavier, nommée, avec une barre de défilement visible (pas masquée)", () => {
    measure(1200, 375);
    render(<KanbanScroller>colonnes</KanbanScroller>);
    expect(region()).toHaveAttribute("tabindex", "0");
    expect(region().className).toContain("overflow-x-auto");
    expect(region().className).not.toMatch(/scrollbar-none|\[scrollbar-width:none\]/);
    expect(region().className).toContain("[scrollbar-width:thin]");
  });

  it("contenu plus large que la région : ombre à droite seulement, décorative", () => {
    measure(1200, 375);
    render(<KanbanScroller>colonnes</KanbanScroller>);
    expect(edge("end")).toBeInTheDocument();
    expect(edge("end")).toHaveAttribute("aria-hidden", "true");
    expect(edge("start")).toBeNull();
  });

  it("défilé au milieu : ombres des deux côtés ; au bout : à gauche seulement", () => {
    measure(1200, 375);
    render(<KanbanScroller>colonnes</KanbanScroller>);
    act(() => scrollTo(300));
    expect(edge("start")).toBeInTheDocument();
    expect(edge("end")).toBeInTheDocument();
    act(() => scrollTo(1200 - 375));
    expect(edge("start")).toBeInTheDocument();
    expect(edge("end")).toBeNull();
  });

  it("contenu qui tient dans la région : aucune ombre", () => {
    measure(375, 375);
    render(<KanbanScroller>colonnes</KanbanScroller>);
    expect(edge("start")).toBeNull();
    expect(edge("end")).toBeNull();
  });

  it("les ombres ne captent ni clic ni focus (pointer-events-none) et utilisent des jetons", () => {
    measure(1200, 375);
    render(<KanbanScroller>colonnes</KanbanScroller>);
    expect(edge("end")?.className).toContain("pointer-events-none");
    expect(edge("end")?.getAttribute("style")).toContain("var(--foreground)");
  });
});
