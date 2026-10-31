import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INSTALL_ID_2, installation } from "./support/github-fixtures.ts";
import {
  ACME,
  ALPHA,
  button,
  createProject,
  INSTALL_ID_1,
  openReadySheet,
  openSheet,
  PROJECT_ID,
  renderProjects,
  setupCreation,
  stepItem,
  submit,
  typeInto,
} from "./support/project-create.tsx";
import { findNamed } from "./support/wait.ts";
import { polyfillRadix, procedures, resetWebMocks, router } from "./support/web-mocks.ts";

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

const AWA = installation({
  id: INSTALL_ID_2,
  ownerKind: "user",
  ownerLogin: "awa-kone",
  userAuthorization: "absent",
});
const SUSPENDED = installation({
  id: "01900000-0000-7000-8000-0000000000e3",
  ownerLogin: "pause-sa",
  status: "suspended",
});
const DELETED = installation({
  id: "01900000-0000-7000-8000-0000000000e4",
  ownerLogin: "parti-sas",
  status: "deleted",
});

const specInput = (call = 0) => procedures.repoCreateSpec.mock.calls[call]?.[0] as object;

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setupCreation();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas du parcours nominal, un test par comportement
describe("Création de projet — parcours nominal (AC-48-19)", () => {
  it("appelle project.create puis repo.createSpec, dans cet ordre, une fois chacun, avec projectId et installationId", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(1));
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
    expect(procedures.projectCreate.mock.calls[0]?.[0]).toEqual({ name: "Alpha" });
    expect(specInput()).toEqual({ projectId: PROJECT_ID, installationId: INSTALL_ID_1 });
    expect(Object.keys(specInput())).not.toContain("name");
    expect(procedures.projectCreate.mock.invocationCallOrder[0]).toBeLessThan(
      procedures.repoCreateSpec.mock.invocationCallOrder[0] as number,
    );
  });

  it("envoie le nom de dépôt saisi", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha", "mon-depot");
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    expect(specInput()).toEqual({
      projectId: PROJECT_ID,
      installationId: INSTALL_ID_1,
      name: "mon-depot",
    });
  });

  it("nom de dépôt de blancs seulement : omis comme un champ vide", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    expect(Object.keys(specInput())).not.toContain("name");
  });

  it("succès : panneau fermé, liste rechargée, annonce « Projet « Alpha » et dépôt de spec créés. », focus au déclencheur", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Projet « Alpha » et dépôt de spec créés.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("Projet « Alpha » créé.");
    expect(screen.getByTestId("create-project-button")).toHaveFocus();
    await screen.findByText("1 projet");
    expect(procedures.projectList.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("un double clic sur « Créer le projet » ne crée qu'un projet et un dépôt", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await typeInto(sheet, "Nom du projet", "Alpha");
    await userEvent.dblClick(within(sheet).getByRole("button", { name: "Créer le projet" }));
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
    expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(1);
  });

  it("la liste des comptes n'est demandée qu'à l'ouverture du panneau", async () => {
    renderProjects();
    await screen.findByTestId("create-project-button");
    expect(procedures.installationList).not.toHaveBeenCalled();
    await openSheet();
    await waitFor(() => expect(procedures.installationList).toHaveBeenCalled());
  });
});

describe("Création de projet — validation avant tout appel", () => {
  it("nom de dépôt invalide : message sous le champ, aria-invalid, focus, aucun projet créé", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha", "x.git");
    const field = within(sheet).getByLabelText("Nom du dépôt (facultatif)");
    expect(
      await within(sheet).findByText(
        "Utilisez uniquement des lettres, chiffres, points, tirets et tirets bas (100 caractères maximum).",
      ),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby");
    expect(field).toHaveFocus();
    expect(procedures.projectCreate).not.toHaveBeenCalled();
    expect(procedures.repoCreateSpec).not.toHaveBeenCalled();
  });

  it.each([".", "..", "mon depot", "a".repeat(101)])(
    "nom de dépôt %j refusé avant project.create",
    async (repoName) => {
      renderProjects();
      const sheet = await openReadySheet();
      await typeInto(sheet, "Nom du projet", "Alpha");
      await userEvent.click(within(sheet).getByLabelText("Nom du dépôt (facultatif)"));
      await userEvent.paste(repoName);
      await submit(sheet);
      await within(sheet).findByText(/Utilisez uniquement des lettres/);
      expect(procedures.projectCreate).not.toHaveBeenCalled();
    },
  );

  it("la correction du nom de dépôt permet ensuite la création", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha", "x.git");
    await within(sheet).findByText(/Utilisez uniquement des lettres/);
    await userEvent.clear(within(sheet).getByLabelText("Nom du dépôt (facultatif)"));
    await typeInto(sheet, "Nom du dépôt (facultatif)", "x-spec");
    await submit(sheet);
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    expect(specInput()).toMatchObject({ name: "x-spec" });
  });

  it("l'aide du champ nomme la règle et le nom par défaut", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    expect(sheet).toHaveTextContent(
      "Laissez vide pour utiliser le nom du projet suivi de « -spec ». Lettres, chiffres, points, tirets et tirets bas, 100 caractères maximum.",
    );
    expect(sheet).toHaveTextContent(
      "Koklo crée pour ce projet un dépôt privé sur GitHub, qui contient la spécification (écrans, fonctionnalités, règles). Vous pourrez la consulter et la modifier depuis Koklo.",
    );
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas du choix de compte, un test par comportement
describe("Création de projet — compte GitHub (AC-48-19)", () => {
  it("une seule installation active : pas de Select, compte en lecture seule envoyé", async () => {
    setupCreation([ACME, SUSPENDED, DELETED]);
    renderProjects();
    const sheet = await openReadySheet();
    expect(within(sheet).queryByRole("combobox")).not.toBeInTheDocument();
    expect(sheet).toHaveTextContent("Compte GitHub : acme-corp (Organisation GitHub)");
    await createProject(sheet);
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    expect(specInput()).toMatchObject({ installationId: INSTALL_ID_1 });
  });

  it("compte personnel : libellé « Compte personnel »", async () => {
    setupCreation([AWA]);
    renderProjects();
    const sheet = await openReadySheet();
    expect(sheet).toHaveTextContent("Compte GitHub : awa-kone (Compte personnel)");
  });

  it("plusieurs actives : Select « Compte GitHub » sans présélection, options lisibles, suspendues et désinstallées absentes", async () => {
    setupCreation([ACME, AWA, SUSPENDED, DELETED]);
    renderProjects();
    const sheet = await openReadySheet();
    const select = within(sheet).getByRole("combobox", { name: "Compte GitHub" });
    expect(select).toHaveTextContent("Choisir un compte");
    await userEvent.click(select);
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["acme-corp · Organisation GitHub", "awa-kone · Compte personnel"]);
  });

  it("plusieurs actives sans choix : message, aria-invalid, aucun appel (pas de dépôt sur le mauvais compte)", async () => {
    setupCreation([ACME, AWA]);
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    expect(
      await within(sheet).findByText("Choisissez le compte GitHub du dépôt."),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole("combobox", { name: "Compte GitHub" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(procedures.projectCreate).not.toHaveBeenCalled();
    expect(procedures.repoCreateSpec).not.toHaveBeenCalled();
  });

  it("plusieurs actives : le compte choisi est celui qui est envoyé", async () => {
    setupCreation([ACME, AWA]);
    renderProjects();
    const sheet = await openReadySheet();
    await userEvent.click(within(sheet).getByRole("combobox", { name: "Compte GitHub" }));
    await userEvent.click(await findNamed("option", "awa-kone · Compte personnel"));
    await createProject(sheet);
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    expect(specInput()).toMatchObject({ projectId: PROJECT_ID, installationId: INSTALL_ID_2 });
  });

  it("compte personnel sans autorisation : aide en texte secondaire, bouton actif", async () => {
    setupCreation([AWA]);
    renderProjects();
    const sheet = await openReadySheet();
    expect(sheet).toHaveTextContent(
      "Ce compte personnel demande votre autorisation. Koklo vous la demandera si besoin après la création du projet.",
    );
    expect(within(sheet).getByRole("button", { name: "Créer le projet" })).toBeEnabled();
  });

  it("compte d'organisation sans autorisation : pas d'aide d'autorisation à froid", async () => {
    setupCreation([installation({ userAuthorization: "absent" })]);
    renderProjects();
    const sheet = await openReadySheet();
    expect(sheet).not.toHaveTextContent("demande votre autorisation");
  });

  it("liste en chargement : « Chargement des comptes GitHub… » et « Créer le projet » désactivé, décrit par ce texte", async () => {
    procedures.installationList.mockReturnValue(new Promise(() => undefined));
    renderProjects();
    const sheet = await openSheet();
    const create = within(sheet).getByRole("button", { name: "Créer le projet" });
    expect(await within(sheet).findByText("Chargement des comptes GitHub…")).toBeInTheDocument();
    expect(create).toBeDisabled();
    const described = create.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(described.split(" ")[0] ?? "")).toHaveTextContent(
      "Chargement des comptes GitHub…",
    );
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("erreur de liste : « Impossible de charger les comptes GitHub », création désactivée, « Réessayer » recharge", async () => {
    procedures.installationList.mockRejectedValueOnce(new Error("boom")).mockResolvedValue([ACME]);
    renderProjects();
    const sheet = await openSheet();
    expect(
      await within(sheet).findByText("Impossible de charger les comptes GitHub"),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Créer le projet" })).toBeDisabled();
    await userEvent.click(await button(sheet, "Réessayer"));
    await waitFor(() =>
      expect(within(sheet).getByRole("button", { name: "Créer le projet" })).toBeEnabled(),
    );
    expect(sheet).toHaveTextContent("Compte GitHub : acme-corp");
    expect(procedures.installationList).toHaveBeenCalledTimes(2);
  });
});

describe("Création de projet — sans compte GitHub (AC-48-22)", () => {
  beforeEach(() => setupCreation([SUSPENDED, DELETED]));

  it("avant l'envoi : alerte neutre « Aucun compte GitHub n'est relié… » et lien « Relier GitHub » vers /github, sans champ de compte ni de dépôt", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    expect(sheet).toHaveTextContent(
      "Aucun compte GitHub n'est relié. Le projet sera créé sans dépôt de spec. Vous pourrez relier GitHub ensuite.",
    );
    expect(within(sheet).getByRole("link", { name: "Relier GitHub" })).toHaveAttribute(
      "href",
      "/github",
    );
    expect(within(sheet).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(sheet).queryByLabelText("Nom du dépôt (facultatif)")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Créer le projet" })).toBeEnabled();
  });

  it("project.create est appelé, repo.createSpec jamais ; le panneau reste ouvert avec l'état « créé, sans dépôt de spec »", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(procedures.projectCreate).toHaveBeenCalledTimes(1));
    const notice = await within(sheet).findByText(
      "Projet « Alpha » créé, sans dépôt de spec. Reliez GitHub pour que Koklo puisse en créer un.",
    );
    expect(procedures.repoCreateSpec).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(stepItem(sheet, 0)).toHaveTextContent("Terminé");
    expect(stepItem(sheet, 1)).toHaveTextContent("Non créé : aucun compte GitHub relié");
    expect(within(sheet).getByRole("link", { name: "Relier GitHub" })).toHaveAttribute(
      "href",
      "/github",
    );
    expect(within(sheet).getByRole("button", { name: "Fermer" })).toBeEnabled();
    expect(document.activeElement).toBeInstanceOf(HTMLElement);
    expect(
      document.activeElement?.contains(notice) || notice.contains(document.activeElement),
    ).toBe(true);
  });

  it("l'état sans dépôt est annoncé (role=status) et Fermer rend le focus au déclencheur", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await within(sheet).findByText(/créé, sans dépôt de spec/);
    expect(within(sheet).getByRole("status")).toHaveTextContent("créé, sans dépôt de spec");
    await userEvent.click(within(sheet).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("create-project-button")).toHaveFocus();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas de l'indicateur d'étapes, un test par état
describe("Création de projet — indicateur d'étapes et annonces (§3.1, §4.1)", () => {
  it("dès l'ouverture : liste « Étapes de la création » avec « Projet » et « Dépôt de spec » à faire", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    expect(stepItem(sheet, 0)).toHaveTextContent("Projet");
    expect(stepItem(sheet, 0)).toHaveTextContent("À faire");
    expect(stepItem(sheet, 1)).toHaveTextContent("Dépôt de spec");
    expect(stepItem(sheet, 1)).toHaveTextContent("À faire");
  });

  it("étape 1 en cours : « En cours… », bouton « Création du projet… » désactivé aria-busy, champs en lecture seule, annonce", async () => {
    procedures.projectCreate.mockReturnValue(new Promise(() => undefined));
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha", "mon-depot");
    const busy = await findNamed("button", "Création du projet…", { scope: within(sheet) });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(stepItem(sheet, 0)).toHaveTextContent("En cours…");
    expect(stepItem(sheet, 1)).toHaveTextContent("À faire");
    expect(within(sheet).getByLabelText("Nom du projet")).toHaveAttribute("readonly");
    expect(within(sheet).getByLabelText("Nom du dépôt (facultatif)")).toHaveAttribute("readonly");
    expect(within(sheet).getByRole("status")).toHaveTextContent("Création du projet…");
    expect(within(sheet).getByRole("button", { name: "Annuler" })).toBeDisabled();
  });

  it("étape 2 en cours : projet « Terminé », dépôt « En cours… », annonce « Projet créé. Création du dépôt de spec… »", async () => {
    procedures.repoCreateSpec.mockReturnValue(new Promise(() => undefined));
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    expect(stepItem(sheet, 0)).toHaveTextContent("Terminé");
    expect(stepItem(sheet, 1)).toHaveTextContent("En cours…");
    expect(within(sheet).getByRole("status")).toHaveTextContent(
      "Projet créé. Création du dépôt de spec…",
    );
    expect(within(sheet).getAllByRole("status")).toHaveLength(1);
  });

  it("le projet apparaît dans la liste dès l'étape 1 (liste invalidée avant la fin de l'étape 2)", async () => {
    procedures.repoCreateSpec.mockReturnValue(new Promise(() => undefined));
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    await waitFor(() => expect(procedures.projectList.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it.each([
    ["Échap", () => userEvent.keyboard("{Escape}")],
    [
      "clic sur Annuler désactivé",
      () => userEvent.click(screen.getByRole("button", { name: "Annuler" })),
    ],
  ])("fermeture bloquée pendant l'étape 1 (%s)", async (_label, close) => {
    procedures.projectCreate.mockReturnValue(new Promise(() => undefined));
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await findNamed("button", "Création du projet…", { scope: within(sheet) });
    await close();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("fermeture bloquée pendant l'étape 2 (Échap)", async () => {
    procedures.repoCreateSpec.mockReturnValue(new Promise(() => undefined));
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Annuler avant tout envoi ferme le panneau sans aucun appel", async () => {
    renderProjects();
    const sheet = await openReadySheet();
    await userEvent.click(within(sheet).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(procedures.projectCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId("create-project-button")).toHaveFocus();
  });

  it("le panneau rouvert repart à zéro : étapes à faire, nom vide, un nouveau project.create possible", async () => {
    renderProjects();
    let sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    procedures.projectCreate.mockResolvedValue({
      ...ALPHA,
      id: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b09",
      name: "Beta",
    });
    sheet = await openReadySheet();
    expect(within(sheet).getByLabelText("Nom du projet")).toHaveValue("");
    expect(stepItem(sheet, 0)).toHaveTextContent("À faire");
    await createProject(sheet, "Beta");
    await waitFor(() => expect(procedures.projectCreate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(2));
  });
});

describe("Création de projet — échec de l'étape 1 (rien n'est créé)", () => {
  it("FORBIDDEN : droits, étape 1 « Non créé », étape 2 « À faire », saisie conservée, aucun createSpec", async () => {
    procedures.projectCreate.mockRejectedValue(
      Object.assign(new Error("F"), { code: "FORBIDDEN" }),
    );
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha", "mon-depot");
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Vous n'avez pas le droit de créer un projet. Demandez à un propriétaire ou à un administrateur.",
    );
    expect(stepItem(sheet, 0)).toHaveTextContent("Non créé");
    expect(stepItem(sheet, 1)).toHaveTextContent("À faire");
    expect(within(sheet).getByLabelText("Nom du projet")).toHaveValue("Alpha");
    expect(within(sheet).getByLabelText("Nom du dépôt (facultatif)")).toHaveValue("mon-depot");
    expect(procedures.repoCreateSpec).not.toHaveBeenCalled();
  });

  it("INTERNAL puis nouvel essai : relance depuis le début (project.create deux fois), puis un seul createSpec", async () => {
    procedures.projectCreate
      .mockRejectedValueOnce(Object.assign(new Error("I"), { code: "INTERNAL" }))
      .mockResolvedValue(ALPHA);
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Le projet n'a pas pu être créé",
    );
    await submit(sheet);
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(1));
    expect(procedures.projectCreate).toHaveBeenCalledTimes(2);
  });
});

describe("Création de projet — rôles", () => {
  it("l'appel installation.list n'a jamais lieu pour un rôle sans droit de création", async () => {
    const { asRole } = await import("./support/github-fixtures.ts");
    asRole("dev");
    renderProjects();
    await screen.findByTestId("projects-empty");
    expect(screen.queryByTestId("create-project-button")).not.toBeInTheDocument();
    expect(procedures.installationList).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
