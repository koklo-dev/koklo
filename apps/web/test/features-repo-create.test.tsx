import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATION_RESUME_KEY } from "../src/lib/creation-resume.ts";
import {
  head,
  INSTALLATION_ID,
  inputsOf,
  PROJECT_ID,
  renderFeatures,
  serve,
  visibleText,
} from "./support/features.tsx";
import { ACME, REPO, rejectWith } from "./support/project-create.tsx";
import { findNamed, findRole } from "./support/wait.ts";
import {
  getSession,
  NO_SESSION,
  navigations,
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
 * TK-48 / 48d, reprise de la création du dépôt de spec depuis la page d'un projet (S-features §4.6) :
 * le panneau de 48c est rouvert EN PLACE à l'étape 2 ; `project.create` n'est jamais rappelé.
 */
const NO_REPO = "Ce projet n'a pas de dépôt de spec";
const PREPARING = "La spec est en cours de préparation";

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  sessionStorage.clear();
  serve("owner");
  procedures.specHead.mockResolvedValue(null);
  procedures.repoList.mockResolvedValue([]);
  procedures.installationList.mockResolvedValue([ACME]);
  procedures.repoCreateSpec.mockResolvedValue(REPO);
});

async function openPanel() {
  renderFeatures();
  await findNamed("heading", NO_REPO);
  await userEvent.click(screen.getByRole("button", { name: "Créer le dépôt de spec" }));
  const dialog = await findRole("dialog");
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "Créer le dépôt" })).toBeEnabled(),
  );
  return dialog;
}

const step = (dialog: HTMLElement, index: 0 | 1) =>
  within(within(dialog).getByRole("list", { name: "Étapes de la création" })).getAllByRole(
    "listitem",
  )[index] as HTMLElement;

describe("Ouverture du panneau en mode reprise", () => {
  it("étape 1 « Terminé » (projet en lecture seule, aucun champ de nom), étape 2 active", async () => {
    const dialog = await openPanel();
    expect(step(dialog, 0)).toHaveTextContent("Terminé");
    expect(within(dialog).queryByLabelText("Nom du projet")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Créer le projet" }),
    ).not.toBeInTheDocument();
    expect(visibleText(dialog)).toContain("Alpha");
    expect(within(dialog).getByLabelText("Nom du dépôt (facultatif)")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Compte GitHub : acme-corp (Organisation GitHub)");
  });

  it("n'appelle jamais project.create à l'ouverture", async () => {
    await openPanel();
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("installation.list n'est demandée qu'à l'ouverture du panneau", async () => {
    renderFeatures();
    await findNamed("heading", NO_REPO);
    expect(procedures.installationList).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Créer le dépôt de spec" }));
    await findRole("dialog");
    await waitFor(() => expect(procedures.installationList).toHaveBeenCalled());
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Création du dépôt", () => {
  it("« Créer le dépôt » : repo.createSpec avec projectId et installationId, ZÉRO project.create", async () => {
    const dialog = await openPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "Créer le dépôt" }));
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(1));
    expect(procedures.repoCreateSpec.mock.calls[0]?.[0]).toEqual({
      projectId: PROJECT_ID,
      installationId: INSTALLATION_ID,
    });
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("nom de dépôt saisi : transmis tel quel", async () => {
    const dialog = await openPanel();
    await userEvent.type(within(dialog).getByLabelText("Nom du dépôt (facultatif)"), "mon-depot");
    await userEvent.click(within(dialog).getByRole("button", { name: "Créer le dépôt" }));
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    expect(procedures.repoCreateSpec.mock.calls[0]?.[0]).toEqual({
      projectId: PROJECT_ID,
      installationId: INSTALLATION_ID,
      name: "mon-depot",
    });
  });

  it("succès : le panneau se ferme, « Dépôt de spec créé. » est annoncé, head et repo.list sont relus, l'écran passe à « en préparation »", async () => {
    const dialog = await openPanel();
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    procedures.repoList.mockResolvedValue([REPO]);
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
    await userEvent.click(within(dialog).getByRole("button", { name: "Créer le dépôt" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const title = await findNamed("heading", PREPARING);
    const regions = await screen.findAllByRole("status");
    expect(regions.some((region) => /Dépôt de spec créé\./.test(region.textContent ?? ""))).toBe(
      true,
    );
    expect(procedures.specHead.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(procedures.repoList.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByRole("button", { name: "Créer le dépôt de spec" }),
    ).not.toBeInTheDocument();
    // le bouton déclencheur est retiré : le focus passe au titre de la carte suivante (tabindex -1)
    expect(title).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(title).toHaveFocus());
    expect(sessionStorage.getItem(CREATION_RESUME_KEY)).toBeNull();
  });

  it("le dépôt existe déjà (spec_repo_exists) : succès, l'écran se relit", async () => {
    const dialog = await openPanel();
    procedures.repoCreateSpec.mockImplementation(
      rejectWith("CONFLICT", { reason: "spec_repo_exists" }),
    );
    procedures.repoList.mockResolvedValue([REPO]);
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
    await userEvent.click(within(dialog).getByRole("button", { name: "Créer le dépôt" }));
    await within(dialog).findByText("Ce projet a déjà son dépôt de spec.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Fermer" }));
    await findNamed("heading", PREPARING);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Erreurs de 48c rendues dans le panneau", () => {
  it("USER_TOKEN_REQUIRED : alerte et action « Autoriser Koklo »", async () => {
    const dialog = await openPanel();
    procedures.repoCreateSpec.mockImplementation(
      rejectWith("USER_TOKEN_REQUIRED", { ownerLogin: "acme-corp" }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Créer le dépôt" }));
    expect(await findRole("alert", { from: dialog })).toBeInTheDocument();
    expect(await findNamed("button", /Autoriser Koklo/, { scope: within(dialog) })).toBeEnabled();
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("PROVIDER_UNAVAILABLE : alerte, « Réessayer » rappelle createSpec seul puis ferme", async () => {
    const dialog = await openPanel();
    procedures.repoCreateSpec.mockImplementationOnce(rejectWith("PROVIDER_UNAVAILABLE"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Créer le dépôt" }));
    expect(await findRole("alert", { from: dialog })).toBeInTheDocument();
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    procedures.specListFeatures.mockResolvedValue({ items: [], nextCursor: null });
    await userEvent.click(await findNamed("button", /^Réessayer/, { scope: within(dialog) }));
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(2));
    expect(procedures.projectCreate).not.toHaveBeenCalled();
    expect(
      inputsOf(procedures.repoCreateSpec).every((input) => input.projectId === PROJECT_ID),
    ).toBe(true);
  });

  it("sans compte GitHub relié : renvoi vers la page GitHub, aucun appel de création", async () => {
    procedures.installationList.mockResolvedValue([]);
    renderFeatures();
    await findNamed("heading", NO_REPO);
    await userEvent.click(screen.getByRole("button", { name: "Créer le dépôt de spec" }));
    const dialog = await findRole("dialog");
    expect(await within(dialog).findByText(/Aucun compte GitHub n'est relié/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Relier GitHub" })).toHaveAttribute(
      "href",
      "/github",
    );
    // le projet existe déjà : le texte de la création complète (« Le projet sera créé… ») est faux ici
    expect(visibleText(dialog)).not.toMatch(/Le projet sera créé/);
    expect(procedures.repoCreateSpec).not.toHaveBeenCalled();
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("UNAUTHORIZED à l'étape 2 : redirection, et aucun texte d'erreur générique pendant la redirection", async () => {
    const dialog = await openPanel();
    procedures.repoCreateSpec.mockImplementation(rejectWith("UNAUTHORIZED"));
    getSession.mockResolvedValue(NO_SESSION);
    await userEvent.click(within(dialog).getByRole("button", { name: "Créer le dépôt" }));
    await waitFor(() => expect(navigations()).toContain("/login"));
    expect(within(dialog).queryByText(/Une erreur est survenue|Réessayez/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("compte disparu (NOT_FOUND) puis fermeture : jamais « Projet créé. », l'écran reste « sans dépôt »", async () => {
    const dialog = await openPanel();
    procedures.repoCreateSpec.mockImplementation(rejectWith("NOT_FOUND"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Créer le dépôt" }));
    await findRole("alert", { from: dialog });
    await userEvent.click(within(dialog).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(visibleText()).not.toMatch(/Projet « Alpha » créé\.|Dépôt de spec créé\./);
    expect(screen.getByRole("heading", { name: NO_REPO })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer le dépôt de spec" })).toBeEnabled();
  });

  it("fermer sans rien tenter rend le focus au bouton déclencheur", async () => {
    const dialog = await openPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: /^(Annuler|Fermer)$/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Créer le dépôt de spec" })).toHaveFocus();
    expect(procedures.repoCreateSpec).not.toHaveBeenCalled();
  });
});
