// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentProposeButton } from "../src/index.ts";

/** TK-99b lot A, cas 1 (maquette 21 l.39-50 et 110-118) : `AgentProposeButton`, cinq états. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("AgentProposeButton", () => {
  it("repos : « Proposer avec l'agent », --primary, 36 de haut (44 sous 768), rayon 6, 14/500", () => {
    render(<AgentProposeButton state="idle" onClick={() => undefined} />);
    const button = screen.getByRole("button", { name: "Proposer avec l'agent" });
    expect(button).toHaveAttribute("data-state", "idle");
    expect(button).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
      "h-11",
      "md:h-9",
      "rounded-md",
    );
    expect(button).not.toHaveAttribute("aria-disabled");
  });

  it("panneau ouvert : halo 3 px --soft et aria-expanded", () => {
    render(<AgentProposeButton state="open" onClick={() => undefined} />);
    const button = screen.getByRole("button", { name: "Proposer avec l'agent" });
    expect(button).toHaveClass("shadow-[0_0_0_3px_var(--secondary)]");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("en cours : « L'agent propose… », opacité .82, curseur progress, un 2e clic ne fait rien", async () => {
    const onClick = vi.fn();
    render(<AgentProposeButton state="running" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "L'agent propose…" });
    expect(button).toHaveClass("opacity-[.82]", "cursor-progress");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("prêt : « Relire N propositions », halo, le clic appelle onClick (ouvre la relecture, jamais un lancement)", async () => {
    const onClick = vi.fn();
    render(<AgentProposeButton state="ready" readyCount={3} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Relire 3 propositions" });
    expect(button).toHaveClass("shadow-[0_0_0_3px_var(--secondary)]");
    expect(button).not.toHaveAttribute("aria-haspopup");
    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("prêt : singulier à une proposition", () => {
    render(<AgentProposeButton state="ready" readyCount={1} onClick={() => undefined} />);
    expect(screen.getByRole("button", { name: "Relire 1 proposition" })).toBeVisible();
  });

  it("indisponible : pointillé --border-strong sur --surface, jamais de onClick ; la raison et le lien vers les réglages s'ouvrent au clic", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <AgentProposeButton
        state="unavailable"
        reason="Aucune clé d'IA dans l'organisation."
        settingsHref="/settings/ai"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole("button", { name: "Proposer avec l'agent" });
    expect(button).toHaveClass(
      "border-dashed",
      "border-border-strong",
      "bg-surface",
      "text-muted-foreground",
    );
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    const panel = within(screen.getByRole("dialog"));
    expect(panel.getByText("Aucune clé d'IA dans l'organisation.")).toBeVisible();
    expect(panel.getByRole("link", { name: "Ouvrir les réglages" })).toHaveAttribute(
      "href",
      "/settings/ai",
    );
  });

  it("la raison est aussi reliée au bouton pour les lecteurs d'écran", () => {
    render(
      <AgentProposeButton
        state="unavailable"
        reason="Pas de dossier d'idée figé."
        onClick={() => undefined}
      />,
    );
    const button = screen.getByRole("button", { name: "Proposer avec l'agent" });
    expect(button).toHaveAccessibleDescription("Pas de dossier d'idée figé.");
  });

  it("libellé de repos propre à l'emplacement (carte d'état vide) ; en cours et prêt gardent leur libellé commun", () => {
    const { rerender } = render(
      <AgentProposeButton
        state="idle"
        idleLabel="Proposer le fonctionnel"
        onClick={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Proposer le fonctionnel" })).toBeTruthy();
    rerender(<AgentProposeButton state="running" idleLabel="Proposer le fonctionnel" />);
    expect(screen.getByRole("button", { name: "L'agent propose…" })).toBeTruthy();
    rerender(
      <AgentProposeButton state="ready" readyCount={2} idleLabel="Proposer le fonctionnel" />,
    );
    expect(screen.getByRole("button", { name: "Relire 2 propositions" })).toBeTruthy();
  });

  it("n'affiche jamais le nom d'un fournisseur d'IA", () => {
    const { container } = render(<AgentProposeButton state="idle" onClick={() => undefined} />);
    expect(container.textContent).not.toMatch(/anthropic|openai|claude|gpt/i);
  });
});
