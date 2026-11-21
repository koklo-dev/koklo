import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArchitectureUpstreamAlert } from "../src/components/architecture-upstream-alert.tsx";
import { staleNoteOf } from "../src/lib/architecture-labels.ts";
import { upstreamTargetOf } from "../src/lib/architecture-upstream.ts";

/** TK-113 lot B, cas 5 : bandeau À revoir (maquette 13 l.122-130, B578 à B580, B587). */
const PROJECT = "00000000-0000-4000-8000-000000000001";

describe("ArchitectureUpstreamAlert", () => {
  it("role=alert, éléments modifiés, composants et flux concernés, version abrégée", () => {
    render(
      <ArchitectureUpstreamAlert
        ids={["T-avis", "T-rappel"]}
        concerned={["C-api", "P-reserver"]}
        version={"5e91c02".padEnd(40, "0")}
        onSee={() => {}}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("a changé depuis la validation (version 5e91c02)");
    expect(alert).toHaveTextContent("T-avis, T-rappel modifiés.");
    expect(alert).toHaveTextContent(
      "Sont concernés : C-api, P-reserver, surlignés dans le schéma.",
    );
  });

  it("« Voir les changements » toujours ; « Proposer les mises à jour » seulement pour qui lance l'agent", async () => {
    const onSee = vi.fn();
    const onPropose = vi.fn();
    const { rerender } = render(
      <ArchitectureUpstreamAlert
        ids={["F-002"]}
        concerned={[]}
        onSee={onSee}
        onPropose={onPropose}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Voir les changements" }));
    await userEvent.click(screen.getByRole("button", { name: "Proposer les mises à jour" }));
    expect(onSee).toHaveBeenCalledOnce();
    expect(onPropose).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("F-002 modifié.");
    rerender(<ArchitectureUpstreamAlert ids={["F-002"]} concerned={[]} onSee={onSee} />);
    expect(screen.queryByRole("button", { name: "Proposer les mises à jour" })).toBeNull();
  });

  it("« Voir les changements » mène à l'écran amont : table dans Données, fonctionnalité dans le Fonctionnel", () => {
    expect(upstreamTargetOf(PROJECT, "T-avis")).toBe(
      `/projects/${PROJECT}/spec/data?tab=tables&sel=T-avis`,
    );
    expect(upstreamTargetOf(PROJECT, "F-002")).toBe(
      `/projects/${PROJECT}/spec/functional?tab=features&sel=F-002`,
    );
  });

  it("fiche d'un composant concerné : table ajoutée non possédée, sinon « a changé » (B587)", () => {
    expect(staleNoteOf(["T-avis"], ["T-reservation"])).toBe(
      "Concerné par le changement : T-avis doit être possédée par un composant.",
    );
    expect(staleNoteOf(["T-reservation", "F-001"], ["T-reservation", "F-001"])).toBe(
      "Concerné par le changement : T-reservation a changé ; F-001 a changé.",
    );
  });
});
