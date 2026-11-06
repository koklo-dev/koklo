// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LifecycleStatus } from "../src/index.ts";

/**
 * TK-87 CA2, cas 2.1 (passation 01 §0.3, DESIGN.md v2 §5.1) : 6 crans dont stage+1 atteints, libellé,
 * aria-label « Avancement : <libellé>, étape <n> sur 6 », stage 5 aux couleurs « Validée ».
 * Contrat d'observation retenu au Red : racine `data-slot="lifecycle-status"`, crans `data-active`.
 */
const STAGES = [
  [0, "Idée"],
  [1, "Spécifiée"],
  [2, "Conçue"],
  [3, "Implémentée"],
  [4, "Testée"],
  [5, "Livrée"],
] as const;

describe("LifecycleStatus", () => {
  it.each(STAGES)("stage %i : libellé « %s » et aria-label complet", (stage, label) => {
    render(<LifecycleStatus stage={stage} />);
    const root = screen.getByLabelText(`Avancement : ${label}, étape ${stage + 1} sur 6`);
    expect(root).toHaveAttribute("data-slot", "lifecycle-status");
    expect(root).toHaveTextContent(label);
  });

  it("exemple de la passation : stage 2 -> « Avancement : Conçue, étape 3 sur 6 »", () => {
    render(<LifecycleStatus stage={2} />);
    expect(screen.getByLabelText("Avancement : Conçue, étape 3 sur 6")).toBeInTheDocument();
  });

  it.each(STAGES)("stage %i : jauge décorative de 6 crans, stage+1 atteints", (stage) => {
    const { container } = render(<LifecycleStatus stage={stage} />);
    const gauge = container.querySelector("[data-slot='lifecycle-status'] [aria-hidden='true']");
    expect(gauge, "jauge aria-hidden").not.toBeNull();
    const notches = gauge?.querySelectorAll("[data-active]") ?? [];
    expect(notches).toHaveLength(6);
    const active = [...notches].filter((n) => n.getAttribute("data-active") === "true");
    expect(active).toHaveLength(stage + 1);
  });

  it("stages 0 à 4 : fond --secondary, texte --foreground, pastille complète", () => {
    for (const [stage] of STAGES.slice(0, 5)) {
      const { container, unmount } = render(<LifecycleStatus stage={stage} />);
      const root = container.querySelector("[data-slot='lifecycle-status']");
      expect(root).toHaveClass("rounded-full", "bg-secondary", "text-foreground");
      unmount();
    }
  });

  it("stage 5 (Livrée) prend les couleurs « Validée »", () => {
    const { container } = render(<LifecycleStatus stage={5} />);
    const root = container.querySelector("[data-slot='lifecycle-status']");
    expect(root).toHaveClass("bg-status-validated", "text-status-validated-foreground");
    expect(root).not.toHaveClass("bg-secondary");
  });

  it("aucun rôle interactif ni couleur de marque", () => {
    const { container } = render(<LifecycleStatus stage={3} />);
    const root = container.querySelector("[data-slot='lifecycle-status']") as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.className).not.toMatch(/primary|violet|purple/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("refuse au type une valeur hors 0..5", () => {
    // @ts-expect-error stage borné à 0 | 1 | 2 | 3 | 4 | 5
    render(<LifecycleStatus stage={6} />);
  });
});
