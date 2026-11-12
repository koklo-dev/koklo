import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inputsOf } from "./support/features.tsx";
import { fake, renderTeam, serveProposals } from "./support/proposals.tsx";
import { findNamed } from "./support/wait.ts";
import { polyfillRadix, procedures, resetWebMocks, watchUrl } from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return {
    useRouter: () => m.router,
    usePathname: () => m.pathname.current,
    useSearchParams: m.useSearchParams,
  };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

/**
 * TK-103 lot B : relecture des quatre types (maquette 10 l.136-166 et l.532-541) : une liste par onglet, détail par
 * type, compteurs « N à relire » par onglet, un seul specBatch.submit pour tout ce qui est accepté.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

/** Les listes des onglets Règles, Rôles et Parcours existent derrière la relecture : une page vide suffit. */
function serveLists(): void {
  procedures.specFunctionalList.mockResolvedValue({
    items: [],
    nextCursor: null,
    previousCursor: null,
    offset: 0,
    total: 0,
  });
  procedures.specRolesMatrix.mockResolvedValue({ roles: [], groups: [], actions: [], total: 0 });
}

const RULE = fake(2, {
  kind: "rule",
  zone: "Règles",
  title: "Délai d'annulation",
  content: {
    title: "Délai d'annulation",
    statement: "Une réservation ne s'annule qu'à plus de 2 h.",
    type: "workflow",
    example: "Rendez-vous à 14 h : jusqu'à 12 h.",
    states: ["Confirmée", "Honorée"],
    features: ["F-002"],
  },
});
const ROLE = fake(3, {
  kind: "role",
  zone: "Rôles",
  title: "Accueil",
  content: {
    name: "Accueil",
    description: "Gère l'agenda du jour.",
    permissions: [
      { id: "PM-agenda.lire" },
      { id: "PM-reservation.modifier", restriction: "les siennes" },
    ],
  },
});
const FLOW = fake(4, {
  kind: "flow",
  zone: "Parcours",
  title: "Réserver un rendez-vous",
  content: {
    title: "Réserver un rendez-vous",
    actor: "Client",
    start: "Accueil du portail",
    steps: ["Choisir un service", "Confirmation"],
    errors: [{ step: 3, text: "créneau pris" }],
    features: ["F-001"],
  },
});
const ALL = [fake(1), RULE, ROLE, FLOW];
const tabs = () => screen.getByRole("navigation", { name: "Sections du cahier fonctionnel" });
const detail = () => document.querySelector("[data-slot=proposal-detail]") as HTMLElement;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Relecture par onglet", () => {
  beforeEach(() => {
    serveProposals(ALL);
    serveLists();
  });

  it("compteurs « N à relire » par onglet, sans compteur pour un onglet sans proposition", async () => {
    renderTeam("?tab=rules&view=review");
    await findNamed("group", "Mode relecture");
    await waitFor(() =>
      expect(
        within(tabs())
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual([
        "Fonctionnalités1 à relire",
        "Règles métier1 à relire",
        "Rôles et permissions1 à relire",
        "Parcours1 à relire",
      ]),
    );
    expect(within(tabs()).getByRole("link", { name: /^Règles métier/ })).toHaveAttribute(
      "href",
      expect.stringContaining("view=review"),
    );
  });

  it("l'onglet Règles ne liste que les règles : sous-ligne « Règle · workflow à états », détail avec états et exemple", async () => {
    renderTeam("?tab=rules&view=review");
    expect(await findNamed("button", /Délai d'annulation/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Accueil/ })).toBeNull();
    expect(screen.getByText("Règle · workflow à états")).toBeVisible();
    const article = await screen.findByRole("article");
    expect(within(article).getByText("Type : workflow à états")).toBeVisible();
    expect(
      within(article).getByText("Une réservation ne s'annule qu'à plus de 2 h."),
    ).toBeVisible();
    expect(within(article).getByRole("list", { name: "États de la règle" })).toBeVisible();
    expect(within(article).getByText("Exemple : Rendez-vous à 14 h : jusqu'à 12 h.")).toBeVisible();
    expect(within(article).getByText("F-002")).toBeVisible();
  });

  it("l'onglet Rôles : « Rôle · 2 permissions » et la liste « Permissions » avec la restriction entre parenthèses", async () => {
    renderTeam("?tab=roles&view=review");
    expect(await findNamed("button", /Accueil/)).toBeVisible();
    expect(screen.getByText("Rôle · 2 permissions")).toBeVisible();
    const article = await screen.findByRole("article");
    expect(within(article).getByRole("heading", { name: "Permissions" })).toBeVisible();
    expect(within(article).getByText("PM-reservation.modifier (les siennes)")).toBeVisible();
  });

  it("l'onglet Parcours : « Parcours · 3 étapes », liste « Étapes » départ puis écrans, cas d'erreur", async () => {
    renderTeam("?tab=flows&view=review");
    expect(await findNamed("button", /Réserver un rendez-vous/)).toBeVisible();
    expect(screen.getByText("Parcours · 3 étapes")).toBeVisible();
    const article = await screen.findByRole("article");
    expect(within(article).getByText("Acteur : Client.")).toBeVisible();
    const steps = within(article)
      .getAllByRole("list")
      .find((list) => list.tagName === "OL");
    expect(
      within(steps as HTMLElement)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Accueil du portail", "Choisir un service", "Confirmation"]);
    expect(within(article).getByText("Étape 3 : créneau pris")).toBeVisible();
  });

  it("une règle, un rôle ou un parcours n'ont pas de bouton « Modifier » (édition sur place des fonctionnalités seulement)", async () => {
    renderTeam("?tab=rules&view=review");
    await screen.findByRole("article");
    expect(
      within(detail() ?? document.body).queryByRole("button", { name: "Modifier" }),
    ).toBeNull();
  });

  it("Accepter décide côté serveur (accept) quel que soit le type", async () => {
    renderTeam("?tab=roles&view=review");
    await userEvent.click(await screen.findByRole("button", { name: /^Accepter/ }));
    await waitFor(() => expect(procedures.proposalDecide).toHaveBeenCalledTimes(1));
    expect(inputsOf(procedures.proposalDecide)[0]).toMatchObject({ decision: "accept" });
  });
});

describe("Enregistrement de plusieurs types", () => {
  it("« Enregistrer N » : un seul specBatch.submit, opérations par type, récapitulatif groupé par onglet", async () => {
    serveLists();
    serveProposals([
      fake(1, { status: "accepted" }),
      { ...RULE, status: "accepted" },
      { ...ROLE, status: "accepted" },
      { ...FLOW, status: "accepted" },
    ]);
    renderTeam("?tab=rules&view=review");
    await userEvent.click(await findNamed("button", "Enregistrer 4 dans la spec"));
    await waitFor(() => expect(procedures.specBatchSubmit).toHaveBeenCalledTimes(1));
    const input = inputsOf(procedures.specBatchSubmit)[0] as {
      operations: Array<{ kind: string }>;
      proposalIds: string[];
    };
    expect(input.operations.map((operation) => operation.kind)).toEqual([
      "feature.create",
      "rule.create",
      "role.create",
      "flow.create",
    ]);
    expect(input.proposalIds).toHaveLength(4);
    await waitFor(() =>
      expect(
        document.querySelector("[data-slot=proposal-review] [role=status]")?.textContent,
      ).toContain("4 enregistrées dans la spec : 1 fonctionnalité, 1 règle, 1 rôle, 1 parcours"),
    );
  });
});
