// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AgentComposer,
  AgentGapsCard,
  AgentPanel,
  AgentPrivacyNote,
  ChatBubble,
  DecisionNotice,
  PageNavItem,
  ProposalDiff,
  ProposedPageCard,
  ProposedPageList,
} from "../src/index.ts";

/** TK-90 lot B : composants de l'agent de l'espace Idée (maquette 06, fiche §5, DESIGN.md §5.9). */

describe("AgentPanel", () => {
  it("aside nommé, en-tête (tuile 28 soft, titre), mode Entretien/Libre en groupe aria-pressed", async () => {
    const onModeChange = vi.fn();
    render(
      <AgentPanel mode="interview" onModeChange={onModeChange} footer={<p>pied</p>}>
        <p>fil</p>
      </AgentPanel>,
    );
    const aside = screen.getByRole("complementary", { name: "Agent" });
    expect(aside).toHaveAttribute("data-slot", "agent-panel");
    expect(aside.querySelector("[data-slot='icon-tile']")).toHaveAttribute("data-size", "28");
    const group = within(aside).getByRole("group", { name: "Mode de l'agent" });
    expect(within(group).getByRole("button", { name: "Entretien" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(within(group).getByRole("button", { name: "Libre" }));
    expect(onModeChange).toHaveBeenCalledWith("free");
    expect(within(aside).getByText("fil")).toBeInTheDocument();
    expect(within(aside).getByText("pied")).toBeInTheDocument();
  });

  it("sans mode : pas de contrôle (état non configuré)", () => {
    render(<AgentPanel>x</AgentPanel>);
    expect(screen.queryByRole("group", { name: "Mode de l'agent" })).toBeNull();
  });
});

describe("ChatBubble", () => {
  it("agent : rayon 4 12 12 12, fond de page, bordure, auteur au-dessus", () => {
    render(
      <ChatBubble author="agent" name="Agent">
        Bonjour
      </ChatBubble>,
    );
    const bubble = screen.getByText("Bonjour");
    expect(bubble).toHaveAttribute("data-slot", "chat-bubble");
    expect(bubble.className).toContain("rounded-[4px_12px_12px_12px]");
    expect(bubble.className).toContain("bg-background");
    expect(bubble.className).toContain("border");
    expect(screen.getByText("Agent")).toHaveClass("text-caption", "text-muted-foreground");
  });

  it("humain : rayon 12 4 12 12, fond secondaire, aligné à droite, contexte en pied", () => {
    render(
      <ChatBubble author="human" name="Marie (client)" context={<a href="#doc">02 · Problème</a>}>
        Réponse
      </ChatBubble>,
    );
    const bubble = screen.getByText("Réponse");
    expect(bubble.className).toContain("rounded-[12px_4px_12px_12px]");
    expect(bubble.className).toContain("bg-secondary");
    expect(bubble.className).toContain("text-foreground");
    expect(bubble.className).toContain("py-2.5");
    expect(bubble.closest("[data-author='human']")?.className).toContain("pl-6");
    expect(bubble.closest("[data-author='human']")?.className).toContain("items-end");
    expect(screen.getByRole("link", { name: "02 · Problème" })).toBeInTheDocument();
  });

  it("agent : retrait de 24 du côté opposé, auteur 12 en 400", () => {
    render(
      <ChatBubble author="agent" name="Agent">
        Bonjour
      </ChatBubble>,
    );
    expect(screen.getByText("Bonjour").closest("[data-author='agent']")?.className).toContain(
      "pr-6",
    );
    expect(screen.getByText("Agent")).toHaveClass("text-caption", "font-normal");
  });

  it("le texte est littéral : aucune balise interprétée", () => {
    render(<ChatBubble author="agent">{"<img src=x onerror=alert(1)> [a](http://x)"}</ChatBubble>);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("AgentComposer", () => {
  function setup(extra: Record<string, unknown> = {}) {
    const onSend = vi.fn();
    const onValueChange = vi.fn();
    const onStop = vi.fn();
    render(
      <AgentComposer
        value="Bonjour"
        onValueChange={onValueChange}
        onSend={onSend}
        onStop={onStop}
        {...extra}
      />,
    );
    return { onSend, onValueChange, onStop };
  }

  it("Entrée envoie, Maj+Entrée n'envoie pas", async () => {
    const { onSend } = setup();
    const box = screen.getByRole("textbox", { name: "Message à l'agent" });
    box.focus();
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("bouton Envoyer nommé, désactivé si le message est vide", async () => {
    const { onSend } = setup({ value: "   " });
    const send = screen.getByRole("button", { name: "Envoyer" });
    expect(send).toBeDisabled();
    await userEvent.click(send);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("textarea de 2 lignes sans bordure, cadre rayon 10 qui porte le focus", () => {
    setup();
    const box = screen.getByRole("textbox", { name: "Message à l'agent" });
    expect(box).toHaveAttribute("rows", "2");
    const frame = box.closest("[data-slot='agent-composer-frame']");
    expect(frame?.className).toContain("rounded-[10px]");
    expect(frame?.className).toContain("focus-within:ring-2");
  });

  it("pendant le flux : Arrêter remplace Envoyer, Entrée n'envoie pas", async () => {
    const { onSend, onStop } = setup({ streaming: true });
    expect(screen.queryByRole("button", { name: "Envoyer" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Arrêter" }));
    expect(onStop).toHaveBeenCalled();
    screen.getByRole("textbox").focus();
    await userEvent.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("Arrêter : le focus passe à la saisie, y compris quand le flux se termine (2.4.3)", async () => {
    const props = { value: "", onValueChange: vi.fn(), onSend: vi.fn(), onStop: vi.fn() };
    const { rerender } = render(<AgentComposer {...props} streaming />);
    const field = screen.getByRole("textbox", { name: "Message à l'agent" });
    await userEvent.click(screen.getByRole("button", { name: "Arrêter" }));
    expect(field).toHaveFocus();
    // Fin naturelle du flux avec le focus sur « Arrêter » : il revient aussi à la saisie.
    (document.activeElement as HTMLElement).blur();
    screen.getByRole("button", { name: "Arrêter" }).focus();
    rerender(<AgentComposer {...props} streaming={false} />);
    expect(screen.getByRole("textbox", { name: "Message à l'agent" })).toHaveFocus();
  });

  it("Envoyer : le focus passe à la saisie (le bouton s'éteint ou devient Arrêter)", async () => {
    const onSend = vi.fn();
    render(<AgentComposer value="Bonjour" onValueChange={vi.fn()} onSend={onSend} />);
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(onSend).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Message à l'agent" })).toHaveFocus();
  });

  it("saisie modifiée : onValueChange", async () => {
    const { onValueChange } = setup({ value: "" });
    await userEvent.type(screen.getByRole("textbox"), "a");
    expect(onValueChange).toHaveBeenCalledWith("a");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("ProposalDiff", () => {
  const base = {
    rationale: "suite à la réponse de Marie",
    onAccept: vi.fn(),
    onEdit: vi.fn(),
    onReject: vi.fn(),
  };

  it.each([
    ["insert_after", "ajout d'une section"],
    ["replace", "remplacement"],
    ["append", "ajout"],
  ] as const)("%s : barre haute « Proposition de l'agent · %s » et justification", (op, label) => {
    render(
      <ProposalDiff {...base} op={op}>
        <p>Contenu</p>
      </ProposalDiff>,
    );
    const region = screen.getByRole("region", { name: "Proposition de l'agent" });
    expect(region).toHaveAttribute("data-slot", "proposal-diff");
    expect(region.className).toContain("border-dashed");
    expect(region.className).toContain("border-primary");
    expect(region.className).toContain("bg-diff-bg");
    expect(region.className).toContain("rounded-xl");
    expect(within(region).getByText(`Proposition de l'agent · ${label}`)).toBeInTheDocument();
    expect(within(region).getByText("suite à la réponse de Marie")).toBeInTheDocument();
  });

  it("remplacement : l'ancien texte est barré et lisible par les lecteurs d'écran", () => {
    render(
      <ProposalDiff {...base} op="replace" previous={<p>Ancien</p>}>
        <p>Nouveau</p>
      </ProposalDiff>,
    );
    const old = screen.getByText("Ancien").closest("[data-slot='proposal-previous']");
    expect(old?.className).toContain("line-through");
    expect(within(old as HTMLElement).getByText("Texte remplacé")).toHaveClass("sr-only");
  });

  it("pied : Accepter (A), Modifier, Rejeter (R)", async () => {
    const onAccept = vi.fn();
    const onEdit = vi.fn();
    const onReject = vi.fn();
    render(
      <ProposalDiff {...base} op="append" onAccept={onAccept} onEdit={onEdit} onReject={onReject}>
        <p>x</p>
      </ProposalDiff>,
    );
    const accept = screen.getByRole("button", { name: /Accepter/ });
    expect(within(accept).getByText("A").tagName).toBe("KBD");
    expect(within(screen.getByRole("button", { name: /Rejeter/ })).getByText("R").tagName).toBe(
      "KBD",
    );
    await userEvent.click(accept);
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    await userEvent.click(screen.getByRole("button", { name: /Rejeter/ }));
    expect([onAccept, onEdit, onReject].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it("A et R n'agissent que si le focus est dans le cadre et hors champ de saisie (2.1.4)", async () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(
      <>
        <button type="button">dehors</button>
        <ProposalDiff {...base} op="append" onAccept={onAccept} onReject={onReject}>
          <textarea aria-label="Texte" />
        </ProposalDiff>
      </>,
    );
    screen.getByRole("button", { name: "dehors" }).focus();
    await userEvent.keyboard("a");
    expect(onAccept).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole("textbox", { name: "Texte" }), "ar");
    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    screen.getByRole("button", { name: "Modifier" }).focus();
    await userEvent.keyboard("a");
    expect(onAccept).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("r");
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("dans une zone contenteditable=false (éditeur), les raccourcis fonctionnent ; dans une zone éditable, non", async () => {
    const onReject = vi.fn();
    render(
      <div contentEditable={false}>
        <ProposalDiff {...base} op="append" onReject={onReject}>
          <p>x</p>
        </ProposalDiff>
      </div>,
    );
    screen.getByRole("button", { name: "Modifier" }).focus();
    await userEvent.keyboard("r");
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("plusieurs propositions : « Proposition 1 sur 3 » et navigation", async () => {
    const onNavigate = vi.fn();
    render(
      <ProposalDiff {...base} op="append" position={{ index: 0, total: 3, onNavigate }}>
        <p>x</p>
      </ProposalDiff>,
    );
    expect(screen.getByText("Proposition 1 sur 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Proposition précédente" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Proposition suivante" }));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("périmée : barrée, message, pas d'Accepter, « Redemander à l'agent »", async () => {
    const onAskAgain = vi.fn();
    render(
      <ProposalDiff {...base} op="append" stale onAskAgain={onAskAgain}>
        <p>Texte</p>
      </ProposalDiff>,
    );
    expect(screen.getByText("Le texte a changé depuis cette proposition.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accepter/ })).toBeNull();
    expect(screen.getByText("Texte").closest("[data-slot='proposal-body']")?.className).toContain(
      "line-through",
    );
    await userEvent.click(screen.getByRole("button", { name: "Redemander à l'agent" }));
    expect(onAskAgain).toHaveBeenCalled();
  });

  it("périmée : Rejeter n'affiche aucun raccourci (R est coupé)", () => {
    render(
      <ProposalDiff {...base} op="append" stale>
        <p>Texte</p>
      </ProposalDiff>,
    );
    const reject = screen.getByRole("button", { name: /Rejeter/ });
    expect(reject.querySelector("kbd")).toBeNull();
    expect(reject).not.toHaveTextContent("R ");
  });

  it("busy : Accepter et Rejeter désactivés", () => {
    render(
      <ProposalDiff {...base} op="append" busy>
        <p>x</p>
      </ProposalDiff>,
    );
    expect(screen.getByRole("button", { name: /Accepter/ })).toHaveAttribute("aria-busy", "true");
  });
});

describe("DecisionNotice", () => {
  it("role=status, icône history, Annuler", async () => {
    const onUndo = vi.fn();
    render(
      <DecisionNotice onUndo={onUndo}>
        Section ajoutée par l'agent, acceptée par vous.
      </DecisionNotice>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Section ajoutée par l'agent, acceptée par vous.");
    expect(status.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onUndo).toHaveBeenCalled();
  });

  it("sans onUndo : pas de bouton", () => {
    render(<DecisionNotice>Rejetée.</DecisionNotice>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ProposedPageCard", () => {
  it("groupe nommé, cadre pointillé, titre, justification, actions 28 px", async () => {
    const onAccept = vi.fn();
    const onIgnore = vi.fn();
    render(
      <ProposedPageCard
        title="Concurrence et alternatives"
        rationale="Marie cite 3 concurrents."
        onAccept={onAccept}
        onIgnore={onIgnore}
      />,
    );
    const group = screen.getByRole("group", { name: "Page proposée par l'agent" });
    expect(group.className).toContain("border-dashed");
    expect(group.className).toContain("bg-diff-bg");
    expect(within(group).getByText("Concurrence et alternatives")).toHaveClass("font-semibold");
    const add = within(group).getByRole("button", { name: "Ajouter la page" });
    expect(add.className).toContain("h-7");
    await userEvent.click(add);
    await userEvent.click(within(group).getByRole("button", { name: "Ignorer" }));
    expect(onAccept).toHaveBeenCalled();
    expect(onIgnore).toHaveBeenCalled();
  });

  it("« N autres » : le focus passe au premier bouton de la première carte révélée", async () => {
    const items = Array.from({ length: 5 }, (_, n) => ({
      id: `p${n}`,
      title: `Page ${n}`,
      rationale: "Raison",
    }));
    render(<ProposedPageList items={items} onAccept={vi.fn()} onIgnore={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "2 autres" }));
    const cards = screen.getAllByRole("group", { name: "Page proposée par l'agent" });
    expect(cards).toHaveLength(5);
    expect(
      within(cards[3] as HTMLElement).getByRole("button", { name: "Ajouter la page" }),
    ).toHaveFocus();
  });

  it("liste : 3 visibles puis « N autres » qui déplie", async () => {
    const items = [1, 2, 3, 4, 5].map((n) => ({
      id: `p${n}`,
      title: `Page ${n}`,
      rationale: "r",
    }));
    const onAccept = vi.fn();
    render(<ProposedPageList items={items} onAccept={onAccept} onIgnore={vi.fn()} />);
    expect(screen.getAllByRole("group", { name: "Page proposée par l'agent" })).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "2 autres" }));
    expect(screen.getAllByRole("group", { name: "Page proposée par l'agent" })).toHaveLength(5);
    await userEvent.click(
      screen.getAllByRole("button", { name: "Ajouter la page" })[4] as HTMLElement,
    );
    expect(onAccept).toHaveBeenCalledWith("p5");
  });
});

describe("AgentGapsCard", () => {
  const items = [
    { id: "g1", file: "02-probleme.md", text: "ne dit pas qui paie.", kind: "page" as const },
    { id: "g2", text: "Aucune page sur la concurrence.", kind: "new-page" as const },
  ];

  it("région nommée, titre, ligne par manque, page en mono, actions selon le type", async () => {
    const onAction = vi.fn();
    render(<AgentGapsCard items={items} onAction={onAction} />);
    const card = screen.getByRole("region", { name: "Manques détectés" });
    expect(within(card).getByText("Ce qui manque encore")).toHaveClass("font-semibold");
    expect(within(card).getByText("02-probleme.md")).toHaveClass("font-mono", "text-code");
    await userEvent.click(within(card).getByRole("button", { name: "Explorer" }));
    expect(onAction).toHaveBeenCalledWith(items[0]);
    await userEvent.click(within(card).getByRole("button", { name: "Proposer une page" }));
    expect(onAction).toHaveBeenCalledWith(items[1]);
  });

  it("4 lignes au plus ; vide : rien n'est rendu", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `g${i}`,
      text: `t${i}`,
      kind: "page" as const,
    }));
    const { container, rerender } = render(<AgentGapsCard items={many} onAction={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: "Explorer" })).toHaveLength(4);
    rerender(<AgentGapsCard items={[]} onAction={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AgentPrivacyNote", () => {
  it("note nue avec cadenas, ligne 12 atténuée, sans détails : pas de bouton", () => {
    render(<AgentPrivacyNote>Envoyé au fournisseur d'IA.</AgentPrivacyNote>);
    const note = screen.getByRole("note");
    expect(note).toHaveClass("text-caption", "text-muted-foreground");
    expect(note.className).not.toContain("border");
    expect(within(note).queryByRole("button")).toBeNull();
  });

  it("« Détails » (22 de haut, aria-expanded) déplie la liste", async () => {
    render(<AgentPrivacyNote details={<p>Jamais de secret.</p>}>Envoyé.</AgentPrivacyNote>);
    const button = screen.getByRole("button", { name: "Détails" });
    expect(button).toHaveClass("h-[22px]", "font-semibold", "underline");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Jamais de secret.")).not.toBeVisible();
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Jamais de secret.")).toBeVisible();
  });
});

describe("PageNavItem pending", () => {
  it("pastille de 7 px --primary et nom accessible « Proposition en attente »", () => {
    render(<PageNavItem href="#p" title="02 · Problème" status="draft" pending />);
    const dot = screen.getByRole("img", { name: "Proposition en attente" });
    expect(dot.className).toContain("size-[7px]");
    expect(dot.className).toContain("bg-primary");
  });

  it("sans propositions : pas de pastille", () => {
    render(<PageNavItem href="#p" title="02 · Problème" status="draft" />);
    expect(screen.queryByRole("img", { name: "Proposition en attente" })).toBeNull();
  });
});
