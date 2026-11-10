import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asRole, INSTALL_ID_2, installation } from "./support/github-fixtures.ts";
import {
  ACME,
  ALPHA,
  openDialog,
  rejectWith,
  renderProjects,
  setupCreation,
  submit,
  typeInto,
} from "./support/project-create.tsx";
import {
  getSession,
  NO_SESSION,
  navigations,
  polyfillRadix,
  procedures,
  resetWebMocks,
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

const OTHER = installation({ id: INSTALL_ID_2, ownerLogin: "jdoe", ownerKind: "user" });
const lastInput = () => procedures.projectCreate.mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  setUrl("/projects");
  setupCreation();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Boîte « Nouveau projet » : contenu", () => {
  it("titre, phrase, focus initial sur « Nom du projet », client facultatif et son aide", async () => {
    renderProjects();
    const dialog = await openDialog();
    expect(dialog).toHaveAccessibleName("Nouveau projet");
    expect(dialog).toHaveTextContent(
      "Le projet démarre par le dossier d'idée. Le dépôt de spec est créé en arrière-plan.",
    );
    expect(within(dialog).getByLabelText("Nom du projet")).toHaveFocus();
    const client = within(dialog).getByLabelText("Client (facultatif)");
    expect(client).toHaveAttribute("placeholder", "nom@entreprise.fr");
    expect(client).toHaveAccessibleDescription(
      "Il recevra une invitation pour écrire l'idée avec vous.",
    );
  });

  it("structure du dossier : fieldset nommé, « Cadrage par défaut » choisi, « Dossier vide » au choix", async () => {
    renderProjects();
    const dialog = await openDialog();
    const group = within(dialog).getByRole("group", { name: "Structure du dossier d'idée" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(group).toHaveTextContent("10 pages : vision, problème, utilisateurs, périmètre…");
    await userEvent.click(within(group).getByRole("radio", { name: /Dossier vide/ }));
    await typeInto(dialog, "Nom du projet", "Alpha");
    await submit(dialog);
    await waitFor(() => expect(lastInput()).toMatchObject({ ideaTemplate: "empty" }));
  });

  it("envoi minimal : nom, gabarit par défaut, compte unique, clé d'idempotence ; ni client ni UE", async () => {
    renderProjects();
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent("Dépôt créé sur acme-corp");
    await typeInto(dialog, "Nom du projet", "  Alpha  ");
    await submit(dialog);
    await waitFor(() => expect(procedures.projectCreate).toHaveBeenCalledTimes(1));
    const input = lastInput();
    expect(input).toMatchObject({ name: "Alpha", ideaTemplate: "default" });
    expect(input.installationId).toBe(ACME.id);
    expect(String(input.idempotencyKey)).toMatch(/^[\w-]{8,64}$/);
    expect(input).not.toHaveProperty("clientEmail");
    expect(input).not.toHaveProperty("euOnly");
    expect(input).not.toHaveProperty("repoName");
  });

  it("une nouvelle clé d'idempotence à chaque ouverture", async () => {
    renderProjects();
    let dialog = await openDialog();
    await typeInto(dialog, "Nom du projet", "Alpha");
    await submit(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const first = lastInput().idempotencyKey;
    dialog = await openDialog();
    await typeInto(dialog, "Nom du projet", "Alpha");
    await submit(dialog);
    await waitFor(() => expect(procedures.projectCreate).toHaveBeenCalledTimes(2));
    expect(lastInput().idempotencyKey).not.toBe(first);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Boîte « Nouveau projet » : compte GitHub", () => {
  it("plusieurs comptes : liste sans présélection, choix obligatoire", async () => {
    procedures.installationList.mockResolvedValue([ACME, OTHER]);
    renderProjects();
    const dialog = await openDialog();
    const select = within(dialog).getByRole("combobox", { name: "Compte GitHub du dépôt de spec" });
    expect(select).toHaveTextContent("Choisir un compte");
    await typeInto(dialog, "Nom du projet", "Alpha");
    await submit(dialog);
    expect(
      await within(dialog).findByText("Choisissez le compte GitHub du dépôt."),
    ).toBeInTheDocument();
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveFocus();
    expect(procedures.projectCreate).not.toHaveBeenCalled();
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole("option", { name: /jdoe/ }));
    await submit(dialog);
    await waitFor(() => expect(lastInput()).toMatchObject({ installationId: INSTALL_ID_2 }));
  });

  it("aucun compte : information neutre, lien « Relier GitHub », ni installationId ni nom de dépôt", async () => {
    procedures.installationList.mockResolvedValue([]);
    renderProjects();
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent(
      "Aucun compte GitHub n'est relié. Le projet sera créé, le dépôt de spec attendra que vous installiez l'application.",
    );
    expect(within(dialog).getByRole("link", { name: "Relier GitHub" })).toHaveAttribute(
      "href",
      "/settings/github",
    );
    expect(within(dialog).queryByText(/Nom du dépôt/)).not.toBeInTheDocument();
    await typeInto(dialog, "Nom du projet", "Alpha");
    await submit(dialog);
    await waitFor(() => expect(procedures.projectCreate).toHaveBeenCalled());
    expect(lastInput()).not.toHaveProperty("installationId");
  });

  it("liste en erreur : « Créer le projet » désactivé, relié à son texte, « Réessayer » recharge", async () => {
    procedures.installationList.mockRejectedValueOnce(new Error("réseau"));
    renderProjects();
    await userEvent.click(await screen.findByTestId("create-project-button"));
    const dialog = await screen.findByRole("dialog", { name: "Nouveau projet" });
    const alert = await within(dialog).findByText("Impossible de charger les comptes GitHub");
    expect(alert).toBeInTheDocument();
    const button = within(dialog).getByRole("button", { name: "Créer le projet" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/Impossible de charger les comptes GitHub/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("nom du dépôt : repli « <slug>-spec · modifier », champ à la demande, nom invalide refusé", async () => {
    renderProjects();
    const dialog = await openDialog();
    await typeInto(dialog, "Nom du projet", "Atelier neuf");
    const fold = within(dialog).getByRole("button", { name: /Nom du dépôt : atelier-neuf-spec/ });
    await userEvent.click(fold);
    const field = within(dialog).getByLabelText("Nom du dépôt");
    await userEvent.type(field, "mauvais nom");
    await submit(dialog);
    expect(await within(dialog).findByText(/Utilisez uniquement des lettres/)).toBeInTheDocument();
    expect(procedures.projectCreate).not.toHaveBeenCalled();
    await userEvent.clear(field);
    await userEvent.type(field, "atelier-spec");
    await submit(dialog);
    await waitFor(() => expect(lastInput()).toMatchObject({ repoName: "atelier-spec" }));
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Boîte « Nouveau projet » : client, UE et validation", () => {
  it("client : adresse invalide refusée avant tout appel, valide transmise", async () => {
    renderProjects();
    const dialog = await openDialog();
    await typeInto(dialog, "Nom du projet", "Alpha");
    await typeInto(dialog, "Client (facultatif)", "marie");
    await submit(dialog);
    const field = within(dialog).getByLabelText("Client (facultatif)");
    expect(
      await within(dialog).findByText("Saisissez une adresse e-mail valide."),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(procedures.projectCreate).not.toHaveBeenCalled();
    await userEvent.clear(field);
    await userEvent.type(field, "marie@salon.fr");
    await submit(dialog);
    await waitFor(() => expect(lastInput()).toMatchObject({ clientEmail: "marie@salon.fr" }));
  });

  it("VALIDATION sur clientEmail : « Cette adresse est déjà membre avec un autre rôle. »", async () => {
    procedures.projectCreate.mockImplementation(
      rejectWith("VALIDATION", { field: "clientEmail", message: "membre" }),
    );
    renderProjects();
    const dialog = await openDialog();
    await typeInto(dialog, "Nom du projet", "Alpha");
    await typeInto(dialog, "Client (facultatif)", "marie@salon.fr");
    await submit(dialog);
    expect(
      await within(dialog).findByText("Cette adresse est déjà membre avec un autre rôle."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Client (facultatif)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("propriétaire : case « Données en UE » éteinte par défaut, envoyée une fois allumée", async () => {
    renderProjects();
    const dialog = await openDialog();
    const toggle = within(dialog).getByRole("switch", {
      name: "Les données de ce projet restent dans l'UE",
    });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await typeInto(dialog, "Nom du projet", "Alpha");
    await submit(dialog);
    await waitFor(() => expect(lastInput()).toMatchObject({ euOnly: true }));
  });

  it("administrateur : la case est aussi proposée", async () => {
    asRole("admin");
    renderProjects();
    const dialog = await openDialog();
    expect(within(dialog).getByRole("switch")).toBeInTheDocument();
  });

  it("nom vide ou trop long : message, aria-invalid, focus, aucun appel", async () => {
    renderProjects();
    const dialog = await openDialog();
    await submit(dialog);
    const name = within(dialog).getByLabelText("Nom du projet");
    expect(await within(dialog).findByText("Saisissez le nom du projet.")).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveFocus();
    fireEvent.change(name, { target: { value: "a".repeat(101) } });
    await submit(dialog);
    expect(
      await within(dialog).findByText("Le nom ne peut pas dépasser 100 caractères."),
    ).toBeInTheDocument();
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("plusieurs champs invalides : résumé en tête de boîte", async () => {
    renderProjects();
    const dialog = await openDialog();
    await typeInto(dialog, "Client (facultatif)", "x");
    await submit(dialog);
    expect(
      await within(dialog).findByText("Corrigez 2 champs avant de continuer."),
    ).toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Boîte « Nouveau projet » : envoi, fermeture, erreurs", () => {
  it("envoi : « Création… » grisé, un seul appel malgré un double clic, boîte fermée, annonce, liste relue", async () => {
    let release: (value: unknown) => void = () => undefined;
    procedures.projectCreate.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );
    renderProjects();
    const dialog = await openDialog();
    await typeInto(dialog, "Nom du projet", "Alpha");
    const button = within(dialog).getByRole("button", { name: "Créer le projet" });
    await userEvent.dblClick(button);
    expect(await within(dialog).findByRole("button", { name: "Création…" })).toBeDisabled();
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
    const callsBefore = procedures.projectCards.mock.calls.length;
    release(ALPHA);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Projet « Alpha » créé.")).toBeInTheDocument();
    await waitFor(() =>
      expect(procedures.projectCards.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it("Échap sans saisie ferme la boîte et rend le focus à « Nouveau projet »", async () => {
    renderProjects();
    await openDialog();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("create-project-button")).toHaveFocus();
  });

  it("Échap ou « Annuler » avec saisie : confirmation, « Continuer la saisie » garde tout, « Abandonner » ferme", async () => {
    renderProjects();
    const dialog = await openDialog();
    await typeInto(dialog, "Nom du projet", "Alpha");
    await userEvent.keyboard("{Escape}");
    const confirm = await screen.findByRole("alertdialog", { name: "Abandonner la création ?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Continuer la saisie" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(within(dialog).getByLabelText("Nom du projet")).toHaveValue("Alpha");
    await userEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));
    const again = await screen.findByRole("alertdialog");
    await userEvent.click(within(again).getByRole("button", { name: "Abandonner" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("create-project-button")).toHaveFocus();
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("FORBIDDEN : alerte de droits, saisie conservée", async () => {
    procedures.projectCreate.mockImplementation(rejectWith("FORBIDDEN"));
    renderProjects();
    const dialog = await openDialog();
    await typeInto(dialog, "Nom du projet", "Alpha");
    await submit(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Vous n'avez pas le droit de créer un projet.",
    );
    expect(within(dialog).getByLabelText("Nom du projet")).toHaveValue("Alpha");
  });

  it("erreur interne : alerte « Le projet n'a pas pu être créé », la boîte reste ouverte", async () => {
    procedures.projectCreate.mockImplementation(rejectWith("INTERNAL"));
    renderProjects();
    const dialog = await openDialog();
    await typeInto(dialog, "Nom du projet", "Alpha");
    await submit(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Le projet n'a pas pu être créé. Une erreur est survenue. Réessayez dans un instant.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("UNAUTHORIZED : redirection, aucun texte d'erreur pendant ce temps", async () => {
    procedures.projectCreate.mockImplementation(rejectWith("UNAUTHORIZED"));
    renderProjects();
    const dialog = await openDialog();
    getSession.mockResolvedValue(NO_SESSION);
    await typeInto(dialog, "Nom du projet", "Alpha");
    await submit(dialog);
    await waitFor(() => expect(navigations()).toContain("/login"));
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("la page vide propose aussi le bouton, et la création s'y affiche aussitôt comme carte", async () => {
    renderProjects();
    const dialog = await openDialog();
    await typeInto(dialog, "Nom du projet", "Alpha");
    await submit(dialog);
    expect(await screen.findByRole("list", { name: "Projets" })).toBeInTheDocument();
  });
});
