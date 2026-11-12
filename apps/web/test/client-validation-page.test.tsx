import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  feature,
  featureDetail,
  progress,
  renderClient,
  serveClient,
} from "./support/client-space.tsx";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
  watchUrl,
} from "./support/web-mocks.ts";

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
 * TK-104 lot B (critères 10 à 12, maquette 10 l.171-224, 643) : la vue client des fonctionnalités, le bandeau, l'en-tête,
 * « Valider le cahier », les droits (client, business, équipe, D1).
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serveClient();
});

const openFirst = async () => {
  await userEvent.click(await screen.findByRole("button", { name: /F-001/ }));
  return screen.findByRole("complementary", { name: "Fiche de la fonctionnalité" });
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Vue client : aiguillage et bandeau", () => {
  it("le client lit la vue client : bandeau ambre, progression, statut, onglets avec compteurs", async () => {
    renderClient();
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("Votre validation est attendue.");
    expect(note).toHaveTextContent("Fonctionnalités 0/3 · parcours 0/2 · règles et rôles 0/2");
    expect(screen.getByText("Validation attendue de votre part")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Sections du cahier fonctionnel" });
    expect(within(nav).getByRole("link", { name: /Règles métier/ })).toHaveTextContent("4");
    expect(procedures.specHead).not.toHaveBeenCalled();
  });

  it.each(["dev", "designer"] as const)(
    "%s garde la vue équipe (aucun appel clientSpace)",
    async (role) => {
      serveClient(role);
      renderClient();
      await waitFor(() => expect(procedures.specHead).toHaveBeenCalled());
      expect(procedures.clientSpaceFeatures).not.toHaveBeenCalled();
      expect(screen.queryByRole("note")).toBeNull();
    },
  );

  it("le business lit sans aucune action : bandeau neutre, pas de bouton de décision", async () => {
    serveClient("business", { canValidate: false });
    renderClient();
    expect(await screen.findByRole("note")).toHaveTextContent("Vous consultez le cahier.");
    await openFirst();
    expect(screen.queryByRole("button", { name: "Valider" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Demander un changement" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Valider le cahier|Envoyer mes demandes/ }),
    ).toBeNull();
  });

  it("propriétaire sans `?vue=client` : vue équipe ; avec `?vue=client` : vue client (D1), onglets qui la gardent", async () => {
    serveClient("owner", { hasClient: false });
    const { unmount } = renderClient();
    await waitFor(() => expect(procedures.specHead).toHaveBeenCalled());
    expect(procedures.clientSpaceFeatures).not.toHaveBeenCalled();
    unmount();
    renderClient("?vue=client");
    expect(await screen.findByRole("note")).toHaveTextContent("Aucun client n'est invité");
    expect(screen.getByRole("link", { name: /Parcours/ })).toHaveAttribute(
      "href",
      expect.stringContaining("vue=client"),
    );
  });

  it("bandeau « N éléments ont changé depuis votre validation »", async () => {
    serveClient("client", { changed: 2 });
    renderClient();
    expect(
      await screen.findByText("2 éléments ont changé depuis votre validation."),
    ).toBeInTheDocument();
  });

  it("n'affiche jamais de vocabulaire git ni de clé de proposition", async () => {
    renderClient();
    await openFirst();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/commit|branche|\.koklo|features\/F-|proposition/i);
    expect(text).toContain("a1b2c3d");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Vue client : fonctionnalités", () => {
  it("la fiche reformule le critère, nomme les liens, garde la note de version", async () => {
    renderClient();
    const fiche = await openFirst();
    expect(
      within(fiche).getByText(
        "Si un service de 30 minutes et que le client choisit un créneau, alors la réservation est confirmée.",
      ),
    ).toBeInTheDocument();
    expect(within(fiche).getByText("Délai d'annulation")).toBeInTheDocument();
    expect(within(fiche).getByText(/4 nov\. · a1b2c3d/)).toHaveClass("font-mono");
    expect(within(fiche).getByText(/Votre validation porte sur la version du/)).toBeInTheDocument();
    expect(within(fiche).queryByRole("button", { name: "Modifier" })).toBeNull();
  });

  it("« Valider » envoie la version lue, annonce la suivante et met le focus sur son titre", async () => {
    renderClient();
    const fiche = await openFirst();
    procedures.clientSpaceProgress.mockResolvedValue(
      progress({ next: { kind: "feature", ref: "F-002" } }),
    );
    procedures.clientSpaceFeature.mockImplementation(async (input) =>
      featureDetail((input as { featureId: string }).featureId, {
        title: `Titre ${(input as { featureId: string }).featureId}`,
      }),
    );
    await userEvent.click(within(fiche).getByRole("button", { name: "Valider" }));
    expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toEqual({
      projectId: expect.any(String),
      targetKind: "feature",
      targetRef: "F-001",
      version: "v-feature",
      status: "approved",
    });
    expect(await screen.findByText("Validée. Suivante : F-002")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Titre F-002" })).toHaveFocus(),
    );
  });

  it("« Demander un changement » envoie le texte nettoyé, sans rien d'autre", async () => {
    renderClient();
    const fiche = await openFirst();
    await userEvent.click(within(fiche).getByRole("button", { name: "Demander un changement" }));
    await userEvent.type(screen.getByLabelText("Que faut-il changer ?"), " Plus tôt ");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer à l'équipe" }));
    expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toMatchObject({
      status: "changes_requested",
      comment: "Plus tôt",
    });
  });

  it("une fonctionnalité à revoir montre la demande du client ; une validée n'a plus d'invite", async () => {
    procedures.clientSpaceFeature.mockResolvedValue(
      featureDetail("F-001", { validation: "to_revise" }),
    );
    procedures.reviewList.mockResolvedValue({
      items: [{ status: "changes_requested", current: true, comment: "Jusqu'à 1 h avant" }],
      nextCursor: null,
    });
    renderClient();
    const fiche = await openFirst();
    expect(await within(fiche).findByText("Jusqu'à 1 h avant")).toBeInTheDocument();
    expect(within(fiche).getByText("Marie · demande de changement")).toBeInTheDocument();
    expect(within(fiche).queryByRole("button", { name: "Valider" })).toBeNull();
  });

  it("le filtre « Non traitées » relit la liste avec `untreated`", async () => {
    renderClient();
    await userEvent.click(await screen.findByRole("button", { name: "Non traitées" }));
    await waitFor(() =>
      expect(procedures.clientSpaceFeatures.mock.calls.at(-1)?.[0]).toMatchObject({
        untreated: "true",
      }),
    );
  });

  it("« Aller à la suivante non traitée » ouvre la suivante, même hors de la page chargée (around)", async () => {
    serveClient("client", { next: { kind: "feature", ref: "F-248" } });
    renderClient();
    await userEvent.click(
      await screen.findByRole("button", { name: "Aller à la suivante non traitée" }),
    );
    await waitFor(() =>
      expect(procedures.clientSpaceFeatures.mock.calls.at(-1)?.[0]).toMatchObject({
        around: "F-248",
      }),
    );
    expect(
      await screen.findByRole("complementary", { name: "Fiche de la fonctionnalité" }),
    ).toBeInTheDocument();
  });

  it("la recherche est envoyée au serveur (q), la liste affiche sa réponse", async () => {
    procedures.clientSpaceFeatures.mockImplementation(async (input) => ({
      items: (input as { q?: string }).q
        ? [feature(2, { title: "Paiement" })]
        : [feature(1, { title: "Connexion" }), feature(2, { title: "Paiement" })],
      nextCursor: null,
      version: "v1",
      total: 2,
      offset: 0,
    }));
    renderClient();
    await userEvent.type(
      await screen.findByRole("searchbox", { name: "Rechercher une fonctionnalité" }),
      "paie",
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: /Connexion/ })).toBeNull());
    expect(screen.getByRole("button", { name: /Paiement/ })).toBeInTheDocument();
    expect(procedures.clientSpaceFeatures.mock.calls.at(-1)?.[0]).toMatchObject({ q: "paie" });
  });

  it("aucune fonctionnalité : « Rien à valider pour l'instant »", async () => {
    procedures.clientSpaceFeatures.mockResolvedValue({
      items: [],
      nextCursor: null,
      version: "v1",
      total: 0,
      offset: 0,
    });
    renderClient();
    expect(await screen.findByText("Rien à valider pour l'instant")).toBeInTheDocument();
  });

  it("erreur de lecture : `ErrorNotice` et « Réessayer »", async () => {
    procedures.clientSpaceFeatures.mockRejectedValue(apiError("INTERNAL"));
    renderClient();
    expect(
      await screen.findByText("Impossible de charger les fonctionnalités"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("un projet inconnu du client : écran « introuvable » uniforme", async () => {
    procedures.clientSpaceProgress.mockRejectedValue(apiError("NOT_FOUND"));
    renderClient();
    expect(await screen.findByText(/introuvable/i)).toBeInTheDocument();
  });
});

describe("Vue client : « Valider le cahier »", () => {
  it("inactif avec sa raison tant qu'il reste des éléments, actif quand tout est traité", async () => {
    renderClient();
    const button = await screen.findByRole("button", { name: "Valider le cahier" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Traitez chaque onglet pour finir")).toBeInTheDocument();
  });

  it("actif : valide le livrable avec la version de la progression ; « Envoyer mes demandes » s'il existe une demande", async () => {
    serveClient("client", { untreated: 0, toRevise: 0 });
    const { unmount } = renderClient();
    await userEvent.click(await screen.findByRole("button", { name: "Valider le cahier" }));
    expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toMatchObject({
      targetKind: "deliverable",
      targetRef: "functional",
      status: "approved",
      version: "v1",
    });
    unmount();
    procedures.reviewSubmit.mockClear();
    serveClient("client", { untreated: 0, toRevise: 2 });
    renderClient();
    await userEvent.click(await screen.findByRole("button", { name: "Envoyer mes demandes" }));
    expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toMatchObject({
      targetKind: "deliverable",
      status: "changes_requested",
    });
  });

  it("un refus du serveur s'affiche en français : « Il reste des éléments à traiter »", async () => {
    serveClient("client", { untreated: 0 });
    procedures.reviewSubmit.mockRejectedValue(
      apiError("CONFLICT", { reason: "review_incomplete" }),
    );
    renderClient();
    await userEvent.click(await screen.findByRole("button", { name: "Valider le cahier" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Il reste des éléments à traiter");
    expect(document.body.textContent).not.toMatch(/review_incomplete|CONFLICT/);
  });

  it("cahier validé : statut « Cahier validé », plus de bouton", async () => {
    serveClient("client", { validation: "validated", untreated: 0 });
    renderClient();
    expect(await screen.findByText("Cahier validé")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Valider le cahier" })).toBeNull();
  });
});
