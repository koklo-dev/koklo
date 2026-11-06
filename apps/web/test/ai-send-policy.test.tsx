import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AiSendPolicy } from "../src/components/ai-send-policy.tsx";

/**
 * TK-87 CA4 (cas 4.1, 4.2, 4.4) : bloc d'envoi en `InlineAlert` neutre + « Détails » (S-framing §3.2 v2,
 * DESIGN.md v2 §5.1, décision B15, questions.md B24). Jamais de nom de fournisseur ni de pays.
 */
const LINE = "Votre texte est envoyé à l'agent IA avec la clé de l'organisation.";
const DETAILS = [
  "Le texte saisi sur cet écran (idée, précisions, brief) et les titres, statuts et priorités des fonctionnalités déjà présentes dans le projet sont envoyés à l'agent IA, avec la clé de votre organisation.",
  "Ne saisissez pas de données personnelles.",
  "Jamais envoyés : clés, identifiants de personnes, noms de l'organisation, du projet ou des dépôts.",
  "Rien n'est enregistré dans votre projet avant votre confirmation.",
  "Les appels sont comptés pour votre organisation.",
];
const PROVIDERS = /Anthropic|OpenAI|Gemini|Google|Mistral|OpenRouter|Claude|GPT|États-Unis/i;

describe("AiSendPolicy (variante complète)", () => {
  it("InlineAlert neutre role=note, icône lock, une ligne, bouton « Détails » replié", () => {
    render(<AiSendPolicy />);
    const note = screen.getByRole("note");
    expect(note).toHaveAttribute("data-slot", "inline-alert");
    expect(note).toHaveAttribute("data-variant", "neutral");
    expect(note).toHaveTextContent(LINE);
    const toggle = screen.getByRole("button", { name: "Détails" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.getAttribute("aria-controls")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("replié : aucune phrase du détail, aucun titre h3, aucune case à cocher", () => {
    render(<AiSendPolicy />);
    for (const sentence of DETAILS) expect(screen.queryByText(sentence)).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("« Détails » déplie les 5 phrases dans la zone contrôlée", async () => {
    render(<AiSendPolicy />);
    const toggle = screen.getByRole("button", { name: "Détails" });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const region = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(region).not.toBeNull();
    for (const sentence of DETAILS) expect(region).toHaveTextContent(sentence);
    expect(screen.getByText(DETAILS[4] as string)).toHaveClass("text-muted-foreground");
  });

  it("au clavier : Entrée déplie, Espace replie", async () => {
    render(<AiSendPolicy />);
    await userEvent.tab();
    const toggle = screen.getByRole("button", { name: "Détails" });
    expect(toggle).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("aucun nom de fournisseur ni de pays, replié comme déplié (B15)", async () => {
    const { container } = render(<AiSendPolicy />);
    expect(container.textContent).not.toMatch(PROVIDERS);
    await userEvent.click(screen.getByRole("button", { name: "Détails" }));
    expect(container.textContent).toContain("agent IA");
    expect(container.textContent).not.toMatch(PROVIDERS);
  });

  it("aucun consentement mémorisé : déplier n'écrit rien en stockage", async () => {
    localStorage.clear();
    render(<AiSendPolicy />);
    await userEvent.click(screen.getByRole("button", { name: "Détails" }));
    expect(localStorage.length).toBe(0);
  });
});

describe("AiSendPolicy variant=reminder", () => {
  it("une ligne lock, « Ces propositions viennent de l'agent IA… », sans action ni nom de fournisseur", () => {
    const { container } = render(<AiSendPolicy variant="reminder" />);
    expect(
      screen.getByText(
        "Ces propositions viennent de l'agent IA et ne sont pas encore enregistrées.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).not.toMatch(PROVIDERS);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
