import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ArchitectureDecisionFiche,
  type DecisionFicheData,
} from "../src/components/architecture-decision-fiche.tsx";

/** TK-113 lot B, cas 2 : fiche d'une décision (maquette 13 l.388-401). */
const DATA: DecisionFicheData = {
  id: "ADR-003",
  title: "Un seul composant écrit en base",
  status: "acceptee",
  date: "2026-10-03",
  deciders: ["Moussa", "Awa"],
  context: "Plusieurs composants pourraient écrire.",
  decision: "Seule l'API écrit. <b>brut</b>",
  consequences: { positive: ["Un seul point de contrôle."], toAccept: ["L'API est un goulot."] },
  alternatives: [{ name: "Écriture partout", reason: "Règles dispersées" }],
  links: ["C-api", "F-001"],
  filePath: "architecture/adr/ADR-003-un-seul.md",
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Fiche d'une décision", () => {
  it("tous les blocs : statut écrit, date et décideurs, sections, conséquences, alternatives, liens, chemin", () => {
    render(<ArchitectureDecisionFiche data={DATA} onEdit={() => {}} />);
    const fiche = within(screen.getByRole("article", { name: "Décision" }));
    expect(fiche.getByRole("heading", { level: 2, name: DATA.title })).toBeVisible();
    expect(fiche.getByText("Acceptée")).toBeVisible();
    expect(fiche.getByText("3 oct. · Moussa, Awa")).toBeVisible();
    for (const name of ["Contexte", "Décision", "Conséquences", "Alternatives écartées"]) {
      expect(fiche.getByRole("heading", { level: 3, name })).toBeVisible();
    }
    expect(fiche.getByText("Positif :")).toBeVisible();
    expect(fiche.getByText("À accepter :")).toBeVisible();
    expect(fiche.getByText("Écriture partout")).toBeVisible();
    expect(fiche.getByText("C-api")).toBeVisible();
    expect(fiche.getByText("architecture/adr/ADR-003-un-seul.md")).toBeVisible();
    expect(fiche.getByRole("button", { name: "Modifier" })).toBeVisible();
    expect(fiche.queryByText("En clair")).toBeNull();
  });

  it("texte brut : une balise dans la décision n'est jamais interprétée", () => {
    render(<ArchitectureDecisionFiche data={DATA} />);
    expect(screen.getByText(/<b>brut<\/b>/)).toBeVisible();
    expect(document.querySelector("article b")).toBeNull();
  });

  it("remplacée : encadré « Remplacée par ADR-004 le 29 oct. » ; sans date, « Remplacée par ADR-004 » (B584)", () => {
    const { rerender } = render(
      <ArchitectureDecisionFiche
        data={{ ...DATA, status: "remplacee", supersededBy: "ADR-004", supersededOn: "2026-10-29" }}
      />,
    );
    expect(screen.getByText("Remplacée par ADR-004 le 29 oct.")).toBeVisible();
    expect(screen.getByText("Remplacée")).toBeVisible();
    rerender(
      <ArchitectureDecisionFiche
        data={{ ...DATA, status: "remplacee", supersededBy: "ADR-004" }}
      />,
    );
    expect(screen.getByText("Remplacée par ADR-004")).toBeVisible();
  });

  it("client : « En clair » si fourni, « Commenter », ni « Modifier » ni chemin ; sans « En clair », encadré omis (B589)", async () => {
    const onComment = vi.fn();
    const client = {
      ...DATA,
      filePath: undefined,
      links: undefined,
      plain: "Un seul endroit écrit.",
    };
    const { rerender } = render(<ArchitectureDecisionFiche data={client} onComment={onComment} />);
    expect(screen.getByText("En clair")).toBeVisible();
    expect(screen.getByText("Un seul endroit écrit.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Commenter" }));
    expect(onComment).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
    expect(screen.queryByText(/Enregistrée dans la spec/)).toBeNull();
    rerender(<ArchitectureDecisionFiche data={{ ...client, plain: undefined }} />);
    expect(screen.queryByText("En clair")).toBeNull();
  });
});
