import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsPage } from "../src/components/projects-page.tsx";
import { renderWithQuery } from "./support/render.tsx";
import {
  apiError,
  cardsPage,
  getSession,
  NO_SESSION,
  navigations,
  ORG_ID,
  organization,
  polyfillRadix,
  procedures,
  projectCard,
  resetWebMocks,
  router,
  sessionWith,
  setUrl,
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

const ID_A = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const ID_B = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b02";
const ID_C = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b03";
const _ALPHA = { id: ID_A, name: "Alpha" };
const alpha = projectCard({ id: ID_A, name: "Alpha", initials: "AL" });
const beta = projectCard({
  id: ID_B,
  name: "Bêta",
  initials: "BÊ",
  colorKey: 2,
  phase: "framing",
  clientContact: "Marie Lefèvre",
  progress: { label: "Livrables validés", done: 2, total: 7, valueLabel: "2 sur 7" },
  nextAction: { title: "Le cahier fonctionnel attend la validation de Marie", attention: true },
});
const gamma = projectCard({
  id: ID_C,
  name: "Gamma",
  initials: "GA",
  colorKey: 3,
  phase: "iterations",
  progress: { label: "Sprint SP-7", done: 5, total: 8, valueLabel: "5 tickets sur 8" },
});

function asRole(role: string) {
  getSession.mockResolvedValue(sessionWith(ORG_ID));
  procedures.organizationList.mockResolvedValue([organization({ role })]);
}

const lastInput = () => procedures.projectCards.mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  setUrl("/projects");
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d\'un écran, un test par comportement
describe("ProjectsPage — grille de cartes", () => {
  it("affiche le chargement annoncé puis une carte par projet, en liens", async () => {
    procedures.projectCards.mockResolvedValue(cardsPage([alpha, beta, gamma]));
    renderWithQuery(<ProjectsPage />);
    const loading = screen.getByTestId("projects-loading");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveTextContent("Chargement des projets…");
    const grid = await screen.findByRole("list", { name: "Projets" });
    expect(within(grid).getAllByRole("link")).toHaveLength(3);
    const link = within(grid).getByRole("link", {
      name: /^Bêta.*Cadrage.*Livrables validés.*2 sur 7/,
    });
    expect(link).toHaveAttribute("href", `/projects/${ID_B}`);
    expect(within(link).getByText("Marie Lefèvre")).toBeInTheDocument();
    expect(within(grid).getByRole("link", { name: /^Alpha.*Idée/ })).toHaveTextContent(
      "Aucun client invité",
    );
  });

  it("en-tête : h1 Projets, emplacement, décompte et projets à traiter", async () => {
    procedures.projectCards.mockResolvedValue(cardsPage([alpha, beta, gamma]));
    renderWithQuery(<ProjectsPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Projets" })).toBeInTheDocument();
    expect(await screen.findByText("3 projets · 1 attend une action")).toBeInTheDocument();
  });

  it("sans filtre, la requête est sans q ni phase, 24 par page, tri par activité", async () => {
    procedures.projectCards.mockResolvedValue(cardsPage([alpha]));
    renderWithQuery(<ProjectsPage />);
    await screen.findByRole("list", { name: "Projets" });
    expect(lastInput()).toEqual({ limit: 24 });
  });

  it("pied : « Fin de la liste · 3 projets »", async () => {
    procedures.projectCards.mockResolvedValue(cardsPage([alpha, beta, gamma]));
    renderWithQuery(<ProjectsPage />);
    expect(await screen.findByText("Fin de la liste · 3 projets")).toBeInTheDocument();
  });

  it("page suivante : « Charger la suite » envoie le curseur du serveur", async () => {
    procedures.projectCards
      .mockResolvedValueOnce(cardsPage([alpha], { nextCursor: "c1", total: 2 }))
      .mockResolvedValueOnce(cardsPage([beta], { total: 2 }));
    renderWithQuery(<ProjectsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Charger la suite" }));
    expect(await screen.findByText("Bêta")).toBeInTheDocument();
    expect(lastInput()).toEqual({ limit: 24, cursor: "c1" });
    expect(screen.getByText("Fin de la liste · 2 projets")).toBeInTheDocument();
  });

  it("erreur de la page suivante : pied en erreur, la liste reste, « Réessayer » relance", async () => {
    procedures.projectCards
      .mockResolvedValueOnce(cardsPage([alpha], { nextCursor: "c1", total: 2 }))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(cardsPage([beta], { total: 2 }));
    renderWithQuery(<ProjectsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Charger la suite" }));
    expect(await screen.findByText(/Impossible de charger la suite/)).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Bêta")).toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d\'un écran, un test par comportement
describe("ProjectsPage — filtres, recherche, tri (dans l'adresse)", () => {
  beforeEach(() => {
    procedures.projectCards.mockResolvedValue(cardsPage([alpha, beta, gamma]));
  });

  it("filtres de phase : groupe nommé, compteurs du serveur, Tous enfoncé par défaut", async () => {
    renderWithQuery(<ProjectsPage />);
    const group = await screen.findByRole("group", { name: "Filtrer par phase" });
    const all = within(group).getByRole("button", { name: /^Tous/ });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveTextContent("3");
    expect(within(group).getByRole("button", { name: /^Cadrage/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(group).getByRole("button", { name: /^Itérations/ })).toHaveTextContent("1");
  });

  it("choisir une phase l'écrit dans l'adresse et relance la requête filtrée", async () => {
    renderWithQuery(<ProjectsPage />);
    const group = await screen.findByRole("group", { name: "Filtrer par phase" });
    await userEvent.click(within(group).getByRole("button", { name: /^Cadrage/ }));
    expect(window.location.search).toBe("?phase=framing");
    await waitFor(() => expect(lastInput()).toEqual({ phase: "framing", limit: 24 }));
    expect(within(group).getByRole("button", { name: /^Cadrage/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(within(group).getByRole("button", { name: /^Tous/ }));
    expect(window.location.search).toBe("");
  });

  it("l'adresse initiale est relue : phase, recherche et tri", async () => {
    setUrl("/projects?phase=idea&q=alp&sort=name");
    renderWithQuery(<ProjectsPage />);
    await screen.findByRole("group", { name: "Filtrer par phase" });
    expect(lastInput()).toEqual({ q: "alp", phase: "idea", sort: "name", limit: 24 });
    expect(screen.getByRole("searchbox", { name: "Rechercher un projet" })).toHaveValue("alp");
  });

  it("la recherche attend la fin de la frappe puis passe par le serveur", async () => {
    renderWithQuery(<ProjectsPage />);
    const box = await screen.findByRole("searchbox", { name: "Rechercher un projet" });
    expect(box).toHaveAttribute("placeholder", "Rechercher un projet ou un client");
    await userEvent.type(box, "hexa");
    await waitFor(() => expect(lastInput()).toEqual({ q: "hexa", limit: 24 }));
    expect(window.location.search).toBe("?q=hexa");
    expect(procedures.projectCards.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("le menu de tri propose les trois ordres et écrit le choix", async () => {
    renderWithQuery(<ProjectsPage />);
    const trigger = await screen.findByRole("button", { name: /Trié par : activité récente/ });
    await userEvent.click(trigger);
    expect(await screen.findByRole("menuitemradio", { name: "Nom" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Action attendue d'abord" }));
    expect(window.location.search).toBe("?sort=attention");
    await waitFor(() => expect(lastInput()).toEqual({ sort: "attention", limit: 24 }));
    expect(
      await screen.findByRole("button", { name: /Trié par : action attendue d'abord/ }),
    ).toBeInTheDocument();
  });

  it("sans résultat : « Aucun projet ne correspond » et « Effacer les filtres »", async () => {
    procedures.projectCards.mockResolvedValue(
      cardsPage([], { facets: { all: 3, idea: 1, framing: 1, iterations: 1 } }),
    );
    setUrl("/projects?phase=framing&q=zzz");
    renderWithQuery(<ProjectsPage />);
    expect(await screen.findByText("Aucun projet ne correspond")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Effacer les filtres" }));
    expect(window.location.search).toBe("");
  });
});

describe("ProjectsPage — états et rôles", () => {
  it("erreur : alerte « Impossible de charger les projets » sans redirection, Réessayer relance", async () => {
    procedures.projectCards.mockRejectedValueOnce(new Error("boom"));
    procedures.projectCards.mockResolvedValue(cardsPage([alpha]));
    renderWithQuery(<ProjectsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de charger les projets");
    expect(router.replace).not.toHaveBeenCalled();
    await userEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
  });

  it("client : mêmes cartes sans ligne de client, sans bouton de création", async () => {
    asRole("client");
    procedures.projectCards.mockResolvedValue(cardsPage([beta, gamma], { audience: "client" }));
    renderWithQuery(<ProjectsPage />);
    const grid = await screen.findByRole("list", { name: "Projets" });
    expect(within(grid).queryByText("Marie Lefèvre")).not.toBeInTheDocument();
    expect(within(grid).queryByText("Aucun client invité")).not.toBeInTheDocument();
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(screen.queryByTestId("create-project-button")).not.toBeInTheDocument();
  });

  it("client sans projet : « Aucun projet pour l'instant », sans action", async () => {
    asRole("client");
    procedures.projectCards.mockResolvedValue(cardsPage([], { audience: "client" }));
    renderWithQuery(<ProjectsPage />);
    const empty = await screen.findByTestId("projects-empty");
    expect(empty).toHaveTextContent("Aucun projet pour l'instant");
    expect(within(empty).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ProjectsPage — UNAUTHORIZED (G1, pas de boucle /login <-> /projects)", () => {
  beforeEach(() => {
    procedures.projectCards.mockImplementation(() => Promise.reject(apiError("UNAUTHORIZED")));
  });

  it("session présente sans organisation active : redirige vers /organizations, jamais /login", async () => {
    getSession.mockResolvedValue(sessionWith(null));
    renderWithQuery(<ProjectsPage />);
    await waitFor(() => expect(navigations()).toContain("/organizations"));
    expect(navigations()).not.toContain("/login");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("session perdue : redirige vers /login, sans message", async () => {
    getSession.mockResolvedValue(NO_SESSION);
    renderWithQuery(<ProjectsPage />);
    await waitFor(() => expect(navigations()).toContain("/login"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ProjectsPage — appel à l'action selon le rôle (C1.b, droits)", () => {
  it.each(["owner", "admin"])(
    "rôle %s : état vide avec « Aucun projet pour l'instant » et bouton « Nouveau projet »",
    async (role) => {
      asRole(role);
      renderWithQuery(<ProjectsPage />);
      const empty = await screen.findByTestId("projects-empty");
      expect(empty).toHaveTextContent("Aucun projet pour l'instant");
      expect(empty).toHaveTextContent(
        "Créez un projet pour commencer le dossier d'idée avec votre client.",
      );
      expect(within(empty).getByRole("button", { name: "Nouveau projet" })).toBeInTheDocument();
      expect(screen.getByTestId("create-project-button")).toHaveAccessibleName("Nouveau projet");
    },
  );

  it.each(["dev", "designer", "client", "business"])(
    "rôle %s : état vide en lecture, aucun bouton « Créer un projet »",
    async (role) => {
      asRole(role);
      renderWithQuery(<ProjectsPage />);
      const empty = await screen.findByTestId("projects-empty");
      expect(empty).toHaveTextContent("Aucun projet pour l'instant");
      expect(empty).toHaveTextContent("Les projets auxquels vous avez accès apparaîtront ici.");
      await waitFor(() => expect(getSession).toHaveBeenCalled());
      expect(screen.queryByTestId("create-project-button")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Nouveau projet" })).not.toBeInTheDocument();
    },
  );

  it("propriétaire avec projets : le bouton reste disponible dans l'en-tête", async () => {
    asRole("owner");
    procedures.projectCards.mockResolvedValue(cardsPage([alpha]));
    renderWithQuery(<ProjectsPage />);
    await screen.findByText("Alpha");
    expect(screen.getByRole("list", { name: "Projets" })).toBeInTheDocument();
    expect(await screen.findByTestId("create-project-button")).toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("ProjectsPage — cartes de création (TK-93 lot C)", () => {
  const creating = projectCard({
    id: ID_B,
    name: "Bêta",
    initials: "BÊ",
    creation: {
      status: "running",
      steps: [
        { key: "project", status: "done" },
        { key: "idea", status: "done" },
        { key: "repo", status: "running" },
      ],
      ideaPages: 10,
      canAct: true,
    },
  });

  afterEach(() => vi.useRealTimers());

  it("une création reste en tête de grille, avant les cartes normales, dans un item de la liste", async () => {
    asRole("owner");
    procedures.projectCards.mockResolvedValue(cardsPage([alpha, creating]));
    procedures.projectCreationStatus.mockResolvedValue(creating.creation);
    renderWithQuery(<ProjectsPage />);
    const grid = await screen.findByRole("list", { name: "Projets" });
    const items = Array.from(grid.children);
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByRole("status")).toHaveTextContent("Bêta");
    expect(
      within(items[1] as HTMLElement).getByRole("link", { name: /Alpha/ }),
    ).toBeInTheDocument();
  });

  it("à la fin de la création, la liste est relue et la carte devient une carte normale", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    asRole("owner");
    procedures.projectCards.mockResolvedValueOnce(cardsPage([creating]));
    procedures.projectCards.mockResolvedValue(cardsPage([{ ...creating, creation: null }]));
    procedures.projectCreationStatus.mockResolvedValue({
      status: "succeeded",
      steps: [
        { key: "project", status: "done" },
        { key: "idea", status: "done" },
        { key: "repo", status: "done" },
      ],
      ideaPages: 10,
      canAct: true,
    });
    renderWithQuery(<ProjectsPage />);
    await screen.findByText("Création du dépôt de spec sur GitHub…");
    await vi.advanceTimersByTimeAsync(3100);
    const link = await screen.findByRole("link", { name: /^Bêta/ });
    expect(link).toHaveAttribute("href", `/projects/${ID_B}`);
    expect(screen.queryByText("Création du dépôt de spec sur GitHub…")).not.toBeInTheDocument();
  });

  it("un projet sans compte GitHub garde sa carte avec « Relier GitHub »", async () => {
    asRole("owner");
    const skipped = projectCard({
      id: ID_B,
      name: "Bêta",
      initials: "BÊ",
      creation: {
        status: "skipped",
        steps: [
          { key: "project", status: "done" },
          { key: "idea", status: "done" },
          { key: "repo", status: "todo" },
        ],
        ideaPages: 10,
        error: { code: "no_account" },
        canAct: true,
      },
    });
    procedures.projectCards.mockResolvedValue(cardsPage([skipped]));
    renderWithQuery(<ProjectsPage />);
    expect(await screen.findByRole("link", { name: "Relier GitHub" })).toHaveAttribute(
      "href",
      "/settings/github",
    );
  });
});
