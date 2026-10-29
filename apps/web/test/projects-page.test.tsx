import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsPage } from "../src/components/projects-page.tsx";
import { renderWithQuery } from "./support/render.tsx";
import {
  apiError,
  getSession,
  NO_SESSION,
  navigations,
  ORG_ID,
  organization,
  polyfillRadix,
  procedures,
  resetWebMocks,
  router,
  sessionWith,
} from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return { useRouter: () => m.router, usePathname: () => m.pathname.current };
});
vi.mock("../src/lib/auth-client.ts", async () => ({
  authClient: (await import("./support/web-mocks.ts")).authClient,
}));
vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

const ALPHA = { id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01", name: "Alpha" };

function asRole(role: string) {
  getSession.mockResolvedValue(sessionWith(ORG_ID));
  procedures.organizationList.mockResolvedValue([organization({ role })]);
}

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
});

describe("ProjectsPage — liste", () => {
  it("affiche le chargement puis la liste des projets", async () => {
    procedures.projectList.mockResolvedValue([ALPHA]);
    renderWithQuery(<ProjectsPage />);
    expect(screen.getByTestId("projects-loading")).toBeInTheDocument();
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
  });

  it("affiche l'erreur sans redirection pour une autre erreur", async () => {
    procedures.projectList.mockImplementation(() => Promise.reject(new Error("boom")));
    renderWithQuery(<ProjectsPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("ProjectsPage — UNAUTHORIZED (G1, pas de boucle /login <-> /projects)", () => {
  beforeEach(() => {
    procedures.projectList.mockImplementation(() => Promise.reject(apiError("UNAUTHORIZED")));
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
    "rôle %s : état vide avec « Créez votre premier projet » et bouton",
    async (role) => {
      asRole(role);
      renderWithQuery(<ProjectsPage />);
      const empty = await screen.findByTestId("projects-empty");
      expect(
        within(empty).getByRole("heading", { name: "Aucun projet pour le moment" }),
      ).toBeInTheDocument();
      expect(empty).toHaveTextContent("Créez votre premier projet pour commencer.");
      expect(screen.getByTestId("create-project-button")).toHaveAccessibleName("Créer un projet");
    },
  );

  it.each(["dev", "designer", "client", "business"])(
    "rôle %s : état vide en lecture, aucun bouton « Créer un projet »",
    async (role) => {
      asRole(role);
      renderWithQuery(<ProjectsPage />);
      const empty = await screen.findByTestId("projects-empty");
      expect(empty).toHaveTextContent("Les projets auxquels vous avez accès apparaîtront ici.");
      await waitFor(() => expect(getSession).toHaveBeenCalled());
      expect(screen.queryByTestId("create-project-button")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Créer un projet" })).not.toBeInTheDocument();
    },
  );

  it("propriétaire avec projets : le bouton reste disponible au-dessus du tableau", async () => {
    procedures.projectList.mockResolvedValue([ALPHA]);
    renderWithQuery(<ProjectsPage />);
    expect(await screen.findByRole("table", { name: "Liste des projets" })).toBeInTheDocument();
    expect(await screen.findByTestId("create-project-button")).toBeInTheDocument();
  });
});

async function openSheet() {
  await userEvent.click(await screen.findByTestId("create-project-button"));
  return screen.findByRole("dialog", { name: "Créer un projet" });
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("ProjectsPage — création de projet (C1.c)", () => {
  beforeEach(() => asRole("owner"));

  it("ouvre un panneau « Créer un projet » avec le champ, « Créer le projet » et « Annuler »", async () => {
    renderWithQuery(<ProjectsPage />);
    const sheet = await openSheet();
    expect(within(sheet).getByLabelText("Nom du projet")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Créer le projet" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Annuler" })).toBeInTheDocument();
    expect(sheet).toHaveAttribute("data-testid", "create-project-sheet");
  });

  it("Annuler ferme le panneau et rend le focus au bouton déclencheur", async () => {
    renderWithQuery(<ProjectsPage />);
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("create-project-button")).toHaveFocus();
  });

  it("succès : project.create reçoit le nom, le panneau se ferme, la liste se recharge, « 1 projet » et annonce", async () => {
    procedures.projectCreate.mockResolvedValue(ALPHA);
    procedures.projectList.mockResolvedValueOnce([]).mockResolvedValue([ALPHA]);
    renderWithQuery(<ProjectsPage />);
    const sheet = await openSheet();
    await userEvent.type(within(sheet).getByLabelText("Nom du projet"), "Alpha");
    await userEvent.click(within(sheet).getByRole("button", { name: "Créer le projet" }));
    await waitFor(() => expect(procedures.projectCreate).toHaveBeenCalled());
    expect(procedures.projectCreate.mock.calls[0]?.[0]).toEqual({ name: "Alpha" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("cell", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByText("1 projet")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Projet « Alpha » créé.");
    expect(screen.getByTestId("create-project-button")).toHaveFocus();
  });

  it("pendant la création : champ en lecture seule, bouton désactivé aria-busy « Création… »", async () => {
    procedures.projectCreate.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<ProjectsPage />);
    const sheet = await openSheet();
    await userEvent.type(within(sheet).getByLabelText("Nom du projet"), "Alpha");
    await userEvent.click(within(sheet).getByRole("button", { name: "Créer le projet" }));
    const busy = await within(sheet).findByRole("button", { name: "Création…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(within(sheet).getByLabelText("Nom du projet")).toHaveAttribute("readonly");
  });

  it("nom vide : « Saisissez le nom du projet. », aria-invalid, focus, aucun appel", async () => {
    renderWithQuery(<ProjectsPage />);
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("button", { name: "Créer le projet" }));
    expect(await within(sheet).findByText("Saisissez le nom du projet.")).toBeInTheDocument();
    const field = within(sheet).getByLabelText("Nom du projet");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby");
    expect(field).toHaveFocus();
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("nom de plus de 100 caractères : message de longueur, aucun appel", async () => {
    renderWithQuery(<ProjectsPage />);
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByLabelText("Nom du projet"));
    await userEvent.paste("a".repeat(101));
    await userEvent.click(within(sheet).getByRole("button", { name: "Créer le projet" }));
    expect(
      await within(sheet).findByText("Le nom ne peut pas dépasser 100 caractères."),
    ).toBeInTheDocument();
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("FORBIDDEN : Alert destructive de droits dans le panneau, saisie conservée", async () => {
    procedures.projectCreate.mockImplementation(() => Promise.reject(apiError("FORBIDDEN")));
    renderWithQuery(<ProjectsPage />);
    const sheet = await openSheet();
    await userEvent.type(within(sheet).getByLabelText("Nom du projet"), "Alpha");
    await userEvent.click(within(sheet).getByRole("button", { name: "Créer le projet" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Vous n'avez pas le droit de créer un projet. Demandez à un propriétaire ou à un administrateur.",
    );
    expect(within(sheet).getByLabelText("Nom du projet")).toHaveValue("Alpha");
  });

  it("INTERNAL : Alert « Le projet n'a pas pu être créé » dans le panneau", async () => {
    procedures.projectCreate.mockImplementation(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<ProjectsPage />);
    const sheet = await openSheet();
    await userEvent.type(within(sheet).getByLabelText("Nom du projet"), "Alpha");
    await userEvent.click(within(sheet).getByRole("button", { name: "Créer le projet" }));
    const alert = await within(sheet).findByRole("alert");
    expect(alert).toHaveTextContent("Le projet n'a pas pu être créé");
    expect(alert).toHaveTextContent("Une erreur est survenue. Réessayez dans un instant.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
