import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INSTALL_ID_2, installation } from "./support/github-fixtures.ts";
import {
  ACME,
  button,
  createProject,
  createWithSpecFailure,
  INSTALL_ID_1,
  openReadySheet,
  PROJECT_ID,
  REPO,
  rejectWith,
  renderProjects,
  setupCreation,
  stepItem,
  typeInto,
} from "./support/project-create.tsx";
import { findNamed } from "./support/wait.ts";
import { polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

const AWA = installation({ id: INSTALL_ID_2, ownerKind: "user", ownerLogin: "awa-kone" });
const unavailable = rejectWith("PROVIDER_UNAVAILABLE");
const TITLE = "Projet créé, dépôt de spec non créé";

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setupCreation();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas de l'échec partiel, un test par comportement
describe("Échec partiel : projet créé, dépôt non créé (AC-48-20)", () => {
  it("garde le projet : titre fixe, étape 1 « Terminé », étape 2 « Non créé », nom du projet en lecture seule", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    expect(stepItem(sheet, 0)).toHaveTextContent("Terminé");
    expect(stepItem(sheet, 1)).toHaveTextContent("Non créé");
    expect(within(sheet).queryByLabelText("Nom du projet")).not.toBeInTheDocument();
    expect(sheet).toHaveTextContent("Projet « Alpha »");
    expect(within(sheet).getByRole("alert")).toHaveTextContent(
      "GitHub ne répond pas, ou l'application GitHub n'est pas configurée sur cet environnement. Votre projet est enregistré ; réessayez plus tard.",
    );
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
  });

  it("la liste des projets est déjà rechargée (le projet existe)", async () => {
    renderProjects();
    await createWithSpecFailure(unavailable);
    await waitFor(() => expect(procedures.projectList.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("une seule alerte à la fois, sans focus volé (annoncée par role=alert)", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    expect(within(sheet).getAllByRole("alert")).toHaveLength(1);
    expect(within(sheet).getByRole("alert")).not.toHaveFocus();
  });

  it("boutons : « Réessayer » (principal) et « Fermer »", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    expect(within(sheet).getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "Fermer" })).toBeEnabled();
  });

  it("« Réessayer » appelle repo.createSpec seul avec le même projectId : zéro project.create de plus (compteur strict)", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    procedures.repoCreateSpec.mockReset();
    procedures.repoCreateSpec.mockResolvedValue(REPO);
    await userEvent.click(within(sheet).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(1));
    expect(procedures.repoCreateSpec.mock.calls[0]?.[0]).toEqual({
      projectId: PROJECT_ID,
      installationId: INSTALL_ID_1,
    });
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
  });

  it("plusieurs réessais échoués puis réussis : project.create reste à 1 appel", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await userEvent.click(await button(sheet, "Réessayer"));
      await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(attempt + 2));
      await findNamed("button", "Réessayer", { scope: within(sheet) });
    }
    procedures.repoCreateSpec.mockResolvedValue(REPO);
    await userEvent.click(await button(sheet, "Réessayer"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
    expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(4);
  });

  it("pendant le réessai : « Nouvelle tentative… » aria-busy, étape 2 « En cours… », fermeture bloquée", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    procedures.repoCreateSpec.mockReturnValue(new Promise(() => undefined));
    await userEvent.click(within(sheet).getByRole("button", { name: "Réessayer" }));
    const busy = await findNamed("button", "Nouvelle tentative…", { scope: within(sheet) });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(stepItem(sheet, 1)).toHaveTextContent("En cours…");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("réussite au réessai : fin identique au succès complet (panneau fermé, annonce, focus), liste non rechargée une fois de plus", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    const listCalls = procedures.projectList.mock.calls.length;
    procedures.repoCreateSpec.mockResolvedValue(REPO);
    await userEvent.click(within(sheet).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Projet « Alpha » et dépôt de spec créés.",
    );
    expect(screen.getByTestId("create-project-button")).toHaveFocus();
    expect(procedures.projectList.mock.calls.length).toBe(listCalls);
  });

  it("le compte et le nom du dépôt restent modifiables pour la reprise et sont pris en compte", async () => {
    setupCreation([ACME, AWA]);
    renderProjects();
    const sheet = await openReadySheet();
    await userEvent.click(within(sheet).getByRole("combobox", { name: "Compte GitHub" }));
    await userEvent.click(await findNamed("option", "acme-corp · Organisation GitHub"));
    procedures.repoCreateSpec.mockImplementation(unavailable);
    await createProject(sheet, "Alpha", "premier");
    await within(sheet).findByText(TITLE);
    procedures.repoCreateSpec.mockReset();
    procedures.repoCreateSpec.mockResolvedValue(REPO);
    await userEvent.click(within(sheet).getByRole("combobox", { name: "Compte GitHub" }));
    await userEvent.click(await findNamed("option", "awa-kone · Compte personnel"));
    const field = within(sheet).getByLabelText("Nom du dépôt (facultatif)");
    await userEvent.clear(field);
    await typeInto(sheet, "Nom du dépôt (facultatif)", "second");
    await userEvent.click(within(sheet).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(1));
    expect(procedures.repoCreateSpec.mock.calls[0]?.[0]).toEqual({
      projectId: PROJECT_ID,
      installationId: INSTALL_ID_2,
      name: "second",
    });
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
  });

  it("un nom de dépôt invalide à la reprise est refusé avant tout appel", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    const calls = procedures.repoCreateSpec.mock.calls.length;
    await typeInto(sheet, "Nom du dépôt (facultatif)", "a b");
    await userEvent.click(within(sheet).getByRole("button", { name: "Réessayer" }));
    await within(sheet).findByText(/Utilisez uniquement des lettres/);
    expect(procedures.repoCreateSpec.mock.calls.length).toBe(calls);
  });

  it("« Fermer » sans réussir ferme le panneau et ne rappelle rien", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    await userEvent.click(within(sheet).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
    expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(1);
  });
});

describe("Échec partiel — dépôt déjà présent (idempotence, spec_repo_exists)", () => {
  const exists = rejectWith("CONFLICT", { reason: "spec_repo_exists" });

  it("au réessai : étape 2 « Terminé », annonce « Ce projet a déjà son dépôt de spec. », plus d'alerte, fermeture proposée", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    procedures.repoCreateSpec.mockImplementation(exists);
    await userEvent.click(within(sheet).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(stepItem(sheet, 1)).toHaveTextContent("Terminé"));
    expect(within(sheet).getByRole("status")).toHaveTextContent(
      "Ce projet a déjà son dépôt de spec.",
    );
    expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Fermer" })).toBeEnabled();
  });

  it("dès la première tentative : traité comme un succès, jamais comme une erreur", async () => {
    procedures.repoCreateSpec.mockImplementation(exists);
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(stepItem(sheet, 1)).toHaveTextContent("Terminé"));
    expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("status")).toHaveTextContent(
      "Ce projet a déjà son dépôt de spec.",
    );
  });

  it("après « Fermer », aucune notice « dépôt de spec non créé » ne reste sur la page", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    procedures.repoCreateSpec.mockImplementation(exists);
    await userEvent.click(within(sheet).getByRole("button", { name: "Réessayer" }));
    await userEvent.click(await button(sheet, "Fermer"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Reprendre" })).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(0);
  });
});

describe("Échec de l'étape 2 — FORBIDDEN (le projet reste)", () => {
  it("message dédié et « Fermer » seul : ni « Réessayer » ni « Autoriser »", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(rejectWith("FORBIDDEN"));
    expect(within(sheet).getByRole("alert")).toHaveTextContent(
      "Vous n'avez plus le droit de créer un dépôt. Le projet est créé : demandez à un propriétaire ou à un administrateur de relier le dépôt.",
    );
    expect(within(sheet).getByRole("button", { name: "Fermer" })).toBeEnabled();
    expect(within(sheet).queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /Autoriser/ })).not.toBeInTheDocument();
  });
});
