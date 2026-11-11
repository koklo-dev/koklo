// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ProposalGenerationBanner, RadioCard, RadioGroup } from "../src/index.ts";

/** TK-99b, correction 1 : bande de génération (maquette 10 l.107-108), carte radio à 1 px, note dans l'état vide. */
describe("ProposalGenerationBanner", () => {
  it("bande role=status pleine largeur, texte, « Annuler l'attente » quitte seulement l'attente", async () => {
    const onLeave = vi.fn();
    render(
      <ProposalGenerationBanner onLeave={onLeave}>
        Cela peut prendre une minute.
      </ProposalGenerationBanner>,
    );
    const band = screen.getByRole("status");
    expect(band).toHaveTextContent("Cela peut prendre une minute.");
    expect(band.className).toContain("bg-diff-bg");
    expect(band.className).toContain("border-b");
    expect(band.className).not.toContain("rounded");
    await userEvent.setup().click(screen.getByRole("button", { name: "Annuler l'attente" }));
    expect(onLeave).toHaveBeenCalledOnce();
  });
});

describe("RadioCard choisie", () => {
  it("bordure de 1 px seulement : pas d'anneau en plus", () => {
    render(
      <RadioGroup value="a" aria-label="Choix">
        <RadioCard value="a" title="A" />
      </RadioGroup>,
    );
    const card = screen.getByRole("radio");
    expect(card.className).toContain("data-[state=checked]:border-primary");
    expect(card.className).not.toContain("ring-primary");
  });
});

describe("EmptyState : note dans le cadre", () => {
  it("la note est dans le cadre pointillé et la phrase peut prendre toute la largeur", () => {
    render(
      <EmptyState icon="task_alt" title="T" description="D" wideDescription note={<p>Note</p>} />,
    );
    const frame = document.querySelector("[data-slot=empty-state]") as HTMLElement;
    expect(frame).toContainElement(screen.getByText("Note"));
    expect(screen.getByText("D").className).not.toContain("max-w-[280px]");
  });
});

describe("AgentProposePopover : en-tête", () => {
  it("tuile et titre sur une même rangée, titre 15/600, pas de compteur de caractères", async () => {
    const { AgentProposePopover } = await import("../src/index.ts");
    render(
      <AgentProposePopover
        open
        onOpenChange={() => undefined}
        subtitle="Cahier"
        options={[{ id: "a", title: "A", description: "d" }]}
        value="a"
        onValueChange={() => undefined}
        instruction=""
        onInstructionChange={() => undefined}
        reads={[]}
        onLaunch={() => undefined}
      />,
    );
    const title = screen.getByRole("heading", { name: "Proposer avec l'agent" });
    expect(title.className).toContain("text-card-title");
    expect(title.parentElement?.parentElement?.className).toContain("flex items-center");
    expect(screen.queryByText(/\/ 500/)).toBeNull();
  });
});
