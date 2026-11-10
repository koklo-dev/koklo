import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  head,
  INSTALLATION_ID,
  inputsOf,
  list,
  PROJECT_ID,
  renderFeatures,
  serve,
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
 * TK-93 lot C : création du dépôt de spec depuis la page d'un projet qui n'en a pas (S-features §4.6). La boîte
 * « Créer le dépôt de spec » appelle `repo.createSpec` seul, jamais `project.create`.
 */
const NO_REPO = "Ce projet n'a pas de dépôt de spec";
const PREPARING = "La spec est en cours de préparation";

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serve("owner");
  procedures.specHead.mockResolvedValue(null);
  procedures.repoList.mockResolvedValue([]);
  procedures.installationList.mockResolvedValue([ACME]);
  procedures.repoCreateSpec.mockResolvedValue(REPO);
});

async function openDialog() {
  renderFeatures();
  await findNamed("heading", NO_REPO);
  await userEvent.click(screen.getByRole("button", { name: "Créer le dépôt de spec" }));
  const dialog = await findRole("dialog", { name: "Créer le dépôt de spec" });
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "Créer le dépôt" })).toBeEnabled(),
  );
  return dialog;
}

const create = (dialog: HTMLElement) =>
  userEvent.click(within(dialog).getByRole("button", { name: "Créer le dépôt" }));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Boîte « Créer le dépôt de spec »", () => {
  it("installation.list n'est demandée qu'à l'ouverture, project.create jamais appelé", async () => {
    renderFeatures();
    await findNamed("heading", NO_REPO);
    expect(procedures.installationList).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Créer le dépôt de spec" }));
    await waitFor(() => expect(procedures.installationList).toHaveBeenCalled());
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("un seul compte : « Dépôt créé sur acme-corp », repo.createSpec avec projectId et installationId", async () => {
    const dialog = await openDialog();
    expect(dialog).toHaveTextContent("Dépôt créé sur acme-corp");
    await create(dialog);
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(1));
    expect(procedures.repoCreateSpec.mock.calls[0]?.[0]).toEqual({
      projectId: PROJECT_ID,
      installationId: INSTALLATION_ID,
    });
  });

  it("nom de dépôt saisi : transmis tel quel ; nom invalide : refusé avant tout appel", async () => {
    const dialog = await openDialog();
    const field = within(dialog).getByLabelText("Nom du dépôt (facultatif)");
    await userEvent.type(field, "mon depot");
    await create(dialog);
    expect(await within(dialog).findByText(/Utilisez uniquement des lettres/)).toBeInTheDocument();
    expect(procedures.repoCreateSpec).not.toHaveBeenCalled();
    await userEvent.clear(field);
    await userEvent.type(field, "mon-depot");
    await create(dialog);
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalled());
    expect(procedures.repoCreateSpec.mock.calls[0]?.[0]).toEqual({
      projectId: PROJECT_ID,
      installationId: INSTALLATION_ID,
      name: "mon-depot",
    });
  });

  it("succès : la boîte se ferme, « Dépôt de spec créé. » est annoncé, l'écran passe à « en préparation »", async () => {
    const dialog = await openDialog();
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    procedures.repoList.mockResolvedValue([REPO]);
    procedures.specListFeatures.mockResolvedValue(list([]));
    await create(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const title = await findNamed("heading", PREPARING);
    const regions = await screen.findAllByRole("status");
    expect(regions.some((region) => /Dépôt de spec créé\./.test(region.textContent ?? ""))).toBe(
      true,
    );
    expect(procedures.specHead.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(title).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(title).toHaveFocus());
  });

  it("le dépôt existe déjà (spec_repo_exists) : succès, l'écran se relit", async () => {
    const dialog = await openDialog();
    procedures.repoCreateSpec.mockImplementation(
      rejectWith("CONFLICT", { reason: "spec_repo_exists" }),
    );
    procedures.repoList.mockResolvedValue([REPO]);
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    procedures.specListFeatures.mockResolvedValue(list([]));
    await create(dialog);
    await findNamed("heading", PREPARING);
  });
});

describe("Erreurs de la création du dépôt", () => {
  it("USER_TOKEN_REQUIRED : alerte et action « Autoriser Koklo »", async () => {
    const dialog = await openDialog();
    procedures.repoCreateSpec.mockImplementation(
      rejectWith("USER_TOKEN_REQUIRED", { ownerLogin: "acme-corp" }),
    );
    await create(dialog);
    expect(await findRole("alert", { from: dialog })).toBeInTheDocument();
    expect(await findNamed("button", /Autoriser Koklo/, { scope: within(dialog) })).toBeEnabled();
  });

  it("PROVIDER_UNAVAILABLE : alerte puis « Réessayer » rappelle createSpec seul", async () => {
    const dialog = await openDialog();
    procedures.repoCreateSpec.mockImplementationOnce(rejectWith("PROVIDER_UNAVAILABLE"));
    await create(dialog);
    expect(await findRole("alert", { from: dialog })).toBeInTheDocument();
    procedures.specHead.mockResolvedValue(head({ status: "building" }));
    procedures.specListFeatures.mockResolvedValue(list([]));
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
      "/settings/github",
    );
    expect(procedures.repoCreateSpec).not.toHaveBeenCalled();
  });

  it("UNAUTHORIZED : redirection, aucun texte d'erreur générique pendant la redirection", async () => {
    const dialog = await openDialog();
    procedures.repoCreateSpec.mockImplementation(rejectWith("UNAUTHORIZED"));
    getSession.mockResolvedValue(NO_SESSION);
    await create(dialog);
    await waitFor(() => expect(navigations()).toContain("/login"));
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fermer sans rien tenter rend le focus au bouton déclencheur", async () => {
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Créer le dépôt de spec" })).toHaveFocus();
    expect(procedures.repoCreateSpec).not.toHaveBeenCalled();
  });
});
