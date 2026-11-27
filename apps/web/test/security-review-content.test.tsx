import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SecurityProposalContent } from "../src/components/security-review-content.tsx";
import { fake } from "./support/proposals.tsx";

/** TK-117 lot C : détail d'une proposition de la Sécurité en relecture (maquette 15 l.106-111), en texte seul. */
const show = (kind: string, content: Record<string, unknown>) =>
  render(<SecurityProposalContent proposal={fake(1, { kind: kind as never, content })} />);

describe("relecture d'une proposition de la Sécurité", () => {
  it("menace : rubriques, scénario et puces ; un texte hostile reste du texte", () => {
    const { container } = show("threat", {
      category: "abuse",
      severity: "low",
      risk: "<img src=x onerror=alert(1)>",
      measures: ["Code SMS."],
      verification: "scenario",
      scenario: { when: "un script appelle", expected: "refus" },
      surfaces: ["F-004"],
      links: [],
    });
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Abus · gravité faible")).toBeVisible();
    expect(container.textContent).toContain("Quand un script appelle");
    expect(screen.getByText("F-004")).toBeVisible();
  });

  it("donnée : la durée proposée est dite à saisir (A7)", () => {
    show("sensitive", { fields: ["a.b"], category: "contact", retentionSuggestion: "1 an" });
    expect(screen.getByText("Conservation suggérée, à saisir par vous")).toBeVisible();
    expect(screen.getByText("Contact")).toBeVisible();
  });

  it("droit, exigence, faits et résumé", () => {
    show("right", { ownershipRule: "Chacun ses rendez-vous." });
    show("asvs", { requirement: { chapter: "api", level: 2, answer: "Contrat." } });
    show("asvs", { facts: [{ label: "Rotation", value: "90 jours" }] });
    show("summary", { location: "À Paris." });
    expect(screen.getByText("Chacun ses rendez-vous.")).toBeVisible();
    expect(screen.getByText("API et services web · niveau 2")).toBeVisible();
    expect(screen.getByText("Rotation : 90 jours")).toBeVisible();
    expect(screen.getByText("Où sont les données")).toBeVisible();
  });
});
