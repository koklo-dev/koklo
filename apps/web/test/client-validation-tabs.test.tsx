import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLOW, ROLES, RULE, renderClient, serveClient } from "./support/client-space.tsx";
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

/** TK-104 lot B (critère 10, maquette 10 l.286-328) : parcours un par un, règles et rôles en bloc. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serveClient();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Vue client : parcours", () => {
  it("chaque parcours porte sa décision ; « Valider ce parcours » envoie la version de la liste", async () => {
    renderClient("?tab=flows");
    const card = (await screen.findByRole("region", { name: /P-reserver/ }))
      .parentElement as HTMLElement;
    await userEvent.click(within(card).getByRole("button", { name: "Valider ce parcours" }));
    expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toMatchObject({
      targetKind: "flow",
      targetRef: "P-reserver",
      version: "v-flows",
      status: "approved",
    });
  });

  it("parcours : barre de compte et recherche (maquette l.277), le filtrage est fait par le serveur", async () => {
    renderClient("?tab=flows");
    await screen.findByRole("region", { name: /P-reserver/ });
    expect(screen.getByRole("searchbox", { name: "Rechercher un parcours" })).toBeInTheDocument();
    expect(screen.getByText(/2 parcours/)).toBeInTheDocument();
  });

  it("demander un changement ouvre « Que faut-il changer dans ce parcours ? »", async () => {
    renderClient("?tab=flows");
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "Demander un changement" }))[0] as HTMLElement,
    );
    await userEvent.type(
      screen.getByLabelText("Que faut-il changer dans ce parcours ?"),
      "Choisir le coiffeur",
    );
    await userEvent.click(screen.getByRole("button", { name: "Envoyer à l'équipe" }));
    expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toMatchObject({
      targetKind: "flow",
      status: "changes_requested",
      comment: "Choisir le coiffeur",
    });
  });

  it("décidé : confirmation verte (success) ou rouge (revise) en `role=status`, « Annuler » écrit `withdrawn`", async () => {
    procedures.clientSpaceFlows.mockResolvedValue({
      items: [
        { ...FLOW, validation: "validated" },
        { ...FLOW, id: "P-annuler", title: "Annuler", validation: "to_revise" },
      ],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 2,
      version: "v-flows",
    });
    renderClient("?tab=flows");
    expect(await screen.findByText("Parcours validé.")).toBeInTheDocument();
    expect(screen.getByText("Changement demandé à l'équipe pour ce parcours.")).toBeInTheDocument();
    const notices = screen.getAllByRole("status");
    expect(
      notices
        .map((n) => n.getAttribute("data-variant"))
        .filter(Boolean)
        .sort(),
    ).toEqual(["revise", "validated"]);
    await userEvent.click(
      within(
        notices.find((n) => n.getAttribute("data-variant") === "validated") as HTMLElement,
      ).getByRole("button", { name: "Annuler" }),
    );
    expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toMatchObject({
      targetRef: "P-reserver",
      status: "withdrawn",
    });
  });

  it("un échec s'affiche sous le parcours concerné seulement", async () => {
    procedures.reviewSubmit.mockRejectedValue(apiError("STALE_VERSION"));
    renderClient("?tab=flows");
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "Valider ce parcours" }))[0] as HTMLElement,
    );
    expect(await screen.findAllByRole("alert")).toHaveLength(1);
  });

  it("le business lit les parcours sans bouton de décision", async () => {
    serveClient("business", { canValidate: false });
    renderClient("?tab=flows");
    await screen.findByRole("region", { name: /P-reserver/ });
    expect(
      screen.queryByRole("button", { name: /Valider ce parcours|Demander un changement/ }),
    ).toBeNull();
  });

  it("aucun parcours : « Rien à valider pour l'instant »", async () => {
    procedures.clientSpaceFlows.mockResolvedValue({
      items: [],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 0,
      version: "v",
    });
    renderClient("?tab=flows");
    expect(await screen.findByText("Rien à valider pour l'instant")).toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Vue client : règles et rôles en bloc", () => {
  it("règles : cartes puis barre « Ces N règles décrivent-elles bien votre activité ? », valider envoie le bloc", async () => {
    renderClient("?tab=rules");
    expect(await screen.findByText(RULE.title)).toBeInTheDocument();
    expect(
      screen.getByText("Ces 1 règles décrivent-elles bien votre activité ?"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Valider les règles" }));
    expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toMatchObject({
      targetKind: "rules",
      targetRef: "rules",
      version: "v-rules",
      status: "approved",
    });
  });

  it("règles : intro, légende des types et recherche (maquette l.227-228), filtrage serveur", async () => {
    renderClient("?tab=rules");
    expect(await screen.findByText(RULE.title)).toBeInTheDocument();
    expect(screen.getByText(/Une règle métier est une vérité du domaine/)).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Rechercher une règle ou R-nnn" }),
    ).toBeInTheDocument();
  });

  it("rôles : cartes, matrice, barre ; une demande de changement envoie le texte", async () => {
    renderClient("?tab=roles");
    expect(
      await screen.findByText(ROLES.roles[1]?.name as string, { selector: "h3, h4, span, p" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Qui peut faire quoi" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Demander un changement" }));
    await userEvent.type(
      screen.getByLabelText("Que faut-il changer ?"),
      "Ajouter un rôle Comptable",
    );
    await userEvent.click(screen.getByRole("button", { name: "Envoyer à l'équipe" }));
    expect(procedures.reviewSubmit.mock.calls[0]?.[0]).toMatchObject({
      targetKind: "roles",
      version: "v-roles",
      status: "changes_requested",
      comment: "Ajouter un rôle Comptable",
    });
  });

  it("rôles décidés : confirmation « Validé. Merci. » avec « Annuler »", async () => {
    procedures.clientSpaceRoles.mockResolvedValue({ ...ROLES, validation: "validated" });
    renderClient("?tab=roles");
    expect(await screen.findByText("Validé. Merci.")).toBeInTheDocument();
  });

  it("le filtre de la matrice porte sur les actions", async () => {
    renderClient("?tab=roles");
    await userEvent.type(
      await screen.findByRole("searchbox", { name: "Filtrer les actions" }),
      "zzz",
    );
    expect(screen.queryByText("Voir l'agenda")).toBeNull();
  });
});
