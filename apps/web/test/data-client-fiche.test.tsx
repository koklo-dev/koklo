import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataClientFiche } from "../src/components/data-client-fiche.tsx";
import { CLIENT_TABLES } from "./support/data-client.tsx";

/** TK-109 lot C, critère 8 : la fiche d'une table vue du client (maquette 11 l.208-228). */
const [client, reservation] = CLIENT_TABLES as [
  (typeof CLIENT_TABLES)[number],
  (typeof CLIENT_TABLES)[number],
];
const links = [{ id: "r0", from: "T-reservation", to: "T-client", label: "n → 1" }];
const nameOf = (id: string) => (id === "T-client" ? "Client" : "Réservation");

describe("DataClientFiche", () => {
  it("identifiant, titre, description et « Ce qu'on enregistre » en liste", () => {
    render(<DataClientFiche table={client} links={[]} nameOf={nameOf} onComment={vi.fn()} />);
    expect(screen.getByText("T-client")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Client" })).toBeInTheDocument();
    expect(screen.getByText("La personne qui réserve.")).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Ce qu'on enregistre" });
    expect(
      within(section)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Le nom du client", "Son numéro de téléphone"]);
  });

  it("sans phrase écrite par l'équipe, la section dit que le résumé n'est pas rédigé (B447)", () => {
    render(
      <DataClientFiche table={reservation} links={links} nameOf={nameOf} onComment={vi.fn()} />,
    );
    expect(screen.getByText("Ce qu'on enregistre")).toBeInTheDocument();
    expect(
      screen.getByText("L'équipe n'a pas encore rédigé le résumé de cette table."),
    ).toBeInTheDocument();
  });

  it("relations « cardinalité Source → Cible » et « Utilisée par » avec libellés", () => {
    render(
      <DataClientFiche table={reservation} links={links} nameOf={nameOf} onComment={vi.fn()} />,
    );
    expect(screen.getByText("n → 1")).toBeInTheDocument();
    expect(screen.getByText("Réservation → Client")).toBeInTheDocument();
    expect(screen.getByText("Réserver un créneau")).toBeInTheDocument();
  });

  it("« Commenter » appelle onComment ; sans onComment (business) le bouton disparaît", async () => {
    const onComment = vi.fn();
    const { rerender } = render(
      <DataClientFiche table={client} links={[]} nameOf={nameOf} onComment={onComment} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Commenter" }));
    expect(onComment).toHaveBeenCalledTimes(1);
    rerender(<DataClientFiche table={client} links={[]} nameOf={nameOf} />);
    expect(screen.queryByRole("button", { name: "Commenter" })).toBeNull();
  });

  it("jamais de contrainte, de YAML ni de bouton de modification", () => {
    render(<DataClientFiche table={client} links={[]} nameOf={nameOf} onComment={vi.fn()} />);
    expect(screen.queryByText("Contraintes")).toBeNull();
    expect(screen.queryByRole("button", { name: /Modifier|YAML|Mermaid/ })).toBeNull();
  });
});
