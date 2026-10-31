import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  button,
  createWithSpecFailure,
  INSTALL_ID_1,
  PROJECT_ID,
  REPO,
  rejectWith,
  renderProjects,
  setupCreation,
  stepItem,
  typeInto,
} from "./support/project-create.tsx";
import { polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

/**
 * Repli « Relier un dépôt existant » (repo.link, design/screens/S-projects.md §5.3).
 * Fichier distinct du cœur de 48c : ce bloc peut être livré en sous-lot séparé sans toucher aux autres tests.
 */
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

const nameTaken = rejectWith("CONFLICT", { reason: "repo_name_taken" });
const LINK_BUTTON = "Relier un dépôt existant";
const SUBMIT = "Relier ce dépôt";

async function openLinkForm(repoName?: string): Promise<HTMLElement> {
  const sheet = await createWithSpecFailure(nameTaken, repoName);
  await userEvent.click(within(sheet).getByRole("button", { name: LINK_BUTTON }));
  return sheet;
}

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setupCreation();
  procedures.repoLink.mockResolvedValue({ ...REPO, mode: "adopted", name: "mon-depot" });
});

describe("Relier un dépôt existant — dépliant (§5.3)", () => {
  it("proposé seulement après repo_name_taken : bouton replié (aria-expanded=false) sous l'alerte", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(nameTaken, "mon-depot");
    const toggle = within(sheet).getByRole("button", { name: LINK_BUTTON });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(sheet).queryByRole("textbox", { name: "Nom du dépôt existant" })).toBeNull();
  });

  it.each([
    ["PROVIDER_UNAVAILABLE", rejectWith("PROVIDER_UNAVAILABLE")],
    ["INTERNAL", rejectWith("INTERNAL")],
    ["NOT_FOUND", rejectWith("NOT_FOUND")],
    ["USER_TOKEN_REQUIRED", rejectWith("USER_TOKEN_REQUIRED", { ownerLogin: "acme-corp" })],
  ])("jamais proposé pour %s", async (_label, error) => {
    renderProjects();
    const sheet = await createWithSpecFailure(error);
    expect(within(sheet).queryByRole("button", { name: LINK_BUTTON })).not.toBeInTheDocument();
  });

  it("déplier : texte d'aide, propriétaire en lecture seule, champ prérempli avec le nom saisi, bouton « Relier ce dépôt »", async () => {
    renderProjects();
    const sheet = await openLinkForm("mon-depot");
    expect(within(sheet).getByRole("button", { name: LINK_BUTTON })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(sheet).toHaveTextContent(
      "Si ce dépôt est déjà prêt, indiquez son nom : Koklo le reliera à ce projet sans le modifier.",
    );
    expect(sheet).toHaveTextContent("Propriétaire : acme-corp");
    expect(within(sheet).getByLabelText("Nom du dépôt existant")).toHaveValue("mon-depot");
    expect(within(sheet).getByRole("button", { name: SUBMIT })).toBeEnabled();
  });

  it("champ vide à l'origine : « Nom du dépôt existant » est vide", async () => {
    renderProjects();
    const sheet = await openLinkForm();
    expect(within(sheet).getByLabelText("Nom du dépôt existant")).toHaveValue("");
  });

  it("replier de nouveau masque le formulaire", async () => {
    renderProjects();
    const sheet = await openLinkForm("mon-depot");
    await userEvent.click(within(sheet).getByRole("button", { name: LINK_BUTTON }));
    await waitFor(() =>
      expect(within(sheet).queryByLabelText("Nom du dépôt existant")).not.toBeInTheDocument(),
    );
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas de l'appel repo.link, un test par comportement
describe("Relier un dépôt existant — appel repo.link", () => {
  it("appelle repo.link({ projectId, installationId, role: spec, ownerLogin, name }) une fois, sans specPath", async () => {
    renderProjects();
    const sheet = await openLinkForm("mon-depot");
    await userEvent.dblClick(within(sheet).getByRole("button", { name: SUBMIT }));
    await waitFor(() => expect(procedures.repoLink).toHaveBeenCalledTimes(1));
    expect(procedures.repoLink.mock.calls[0]?.[0]).toEqual({
      projectId: PROJECT_ID,
      installationId: INSTALL_ID_1,
      role: "spec",
      ownerLogin: "acme-corp",
      name: "mon-depot",
    });
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
  });

  it("envoie le nom modifié dans le champ", async () => {
    renderProjects();
    const sheet = await openLinkForm("mon-depot");
    const field = within(sheet).getByLabelText("Nom du dépôt existant");
    await userEvent.clear(field);
    await userEvent.type(field, "deja-pret");
    await userEvent.click(within(sheet).getByRole("button", { name: SUBMIT }));
    await waitFor(() => expect(procedures.repoLink).toHaveBeenCalled());
    expect(procedures.repoLink.mock.calls[0]?.[0]).toMatchObject({ name: "deja-pret" });
  });

  it("nom vide : aucun appel", async () => {
    renderProjects();
    const sheet = await openLinkForm();
    await userEvent.click(within(sheet).getByRole("button", { name: SUBMIT }));
    expect(procedures.repoLink).not.toHaveBeenCalled();
  });

  it("succès : fin du succès complet, annonce « Projet « Alpha » et dépôt de spec reliés. », focus au déclencheur", async () => {
    renderProjects();
    const sheet = await openLinkForm("mon-depot");
    await userEvent.click(within(sheet).getByRole("button", { name: SUBMIT }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Projet « Alpha » et dépôt de spec reliés.",
    );
    expect(screen.getByTestId("create-project-button")).toHaveFocus();
    expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
  });

  it("NOT_FOUND : « Koklo ne trouve pas ce dépôt sur acme-corp. Vérifiez le nom, et que l'application GitHub a accès à ce dépôt. »", async () => {
    procedures.repoLink.mockImplementation(rejectWith("NOT_FOUND"));
    renderProjects();
    const sheet = await openLinkForm("mon-depot");
    await userEvent.click(within(sheet).getByRole("button", { name: SUBMIT }));
    expect(
      await within(sheet).findByText(/Koklo ne trouve pas ce dépôt sur acme-corp\./),
    ).toHaveTextContent(
      "Koklo ne trouve pas ce dépôt sur acme-corp. Vérifiez le nom, et que l'application GitHub a accès à ce dépôt.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("CONFLICT repo_already_linked : « Ce dépôt est déjà relié à un projet. »", async () => {
    procedures.repoLink.mockImplementation(
      rejectWith("CONFLICT", { reason: "repo_already_linked" }),
    );
    renderProjects();
    const sheet = await openLinkForm("mon-depot");
    await userEvent.click(within(sheet).getByRole("button", { name: SUBMIT }));
    expect(
      await within(sheet).findByText("Ce dépôt est déjà relié à un projet."),
    ).toBeInTheDocument();
  });

  it("CONFLICT spec_repo_exists : traité comme un succès (étape 2 « Terminé », « Ce projet a déjà son dépôt de spec. »)", async () => {
    procedures.repoLink.mockImplementation(rejectWith("CONFLICT", { reason: "spec_repo_exists" }));
    renderProjects();
    const sheet = await openLinkForm("mon-depot");
    await userEvent.click(within(sheet).getByRole("button", { name: SUBMIT }));
    await waitFor(() => expect(stepItem(sheet, 1)).toHaveTextContent("Terminé"));
    expect(within(sheet).getByRole("status")).toHaveTextContent(
      "Ce projet a déjà son dépôt de spec.",
    );
  });

  it.each([
    [
      "503 PROVIDER_UNAVAILABLE",
      rejectWith("PROVIDER_UNAVAILABLE"),
      "GitHub ne répond pas, ou l'application GitHub n'est pas configurée sur cet environnement. Votre projet est enregistré ; réessayez plus tard.",
    ],
    [
      "429 PROVIDER_RATE_LIMITED",
      rejectWith("PROVIDER_RATE_LIMITED", { retryAfterMs: 2000 }),
      "GitHub limite temporairement les demandes. Réessayez dans environ 2 secondes.",
    ],
    [
      "PROVIDER_AUTH_EXPIRED installation",
      rejectWith("PROVIDER_AUTH_EXPIRED", { kind: "installation", refreshable: false }),
      "L'accès de Koklo à ce compte GitHub a expiré. Réinstallez l'application depuis la page GitHub, puis revenez réessayer.",
    ],
    [
      "autre",
      rejectWith("INTERNAL"),
      "Le dépôt de spec n'a pas pu être créé. Une erreur est survenue. Vérifiez votre connexion puis réessayez.",
    ],
  ])("%s : mêmes textes que le tableau des erreurs", async (_label, error, text) => {
    procedures.repoLink.mockImplementation(error);
    renderProjects();
    const sheet = await openLinkForm("mon-depot");
    await userEvent.click(within(sheet).getByRole("button", { name: SUBMIT }));
    await waitFor(() => expect(procedures.repoLink).toHaveBeenCalled());
    await waitFor(() => expect(sheet).toHaveTextContent(text));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("pendant l'appel : bouton désactivé aria-busy, fermeture bloquée", async () => {
    procedures.repoLink.mockReturnValue(new Promise(() => undefined));
    renderProjects();
    const sheet = await openLinkForm("mon-depot");
    await userEvent.click(within(sheet).getByRole("button", { name: SUBMIT }));
    await waitFor(() => expect(procedures.repoLink).toHaveBeenCalled());
    const busy = await button(sheet, SUBMIT);
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Relier un dépôt existant — depuis la notice de reprise", () => {
  it("après repo_name_taken puis fermeture, la notice de page offre aussi « Relier un dépôt existant »", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(nameTaken, "mon-depot");
    await userEvent.click(within(sheet).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const notice = await screen.findByRole("alert");
    expect(within(notice).getByRole("button", { name: LINK_BUTTON })).toBeInTheDocument();
  });

  it("le champ prérempli est celui de la dernière saisie", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(nameTaken);
    await typeInto(sheet, "Nom du dépôt (facultatif)", "autre-nom");
    await userEvent.click(within(sheet).getByRole("button", { name: LINK_BUTTON }));
    expect(within(sheet).getByLabelText("Nom du dépôt existant")).toHaveValue("autre-nom");
  });
});
