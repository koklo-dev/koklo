import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect } from "vitest";
import { ProjectsPage } from "../../src/components/projects-page.tsx";
import { asRole, INSTALL_ID_1, installation } from "./github-fixtures.ts";
import { renderWithQuery } from "./render.tsx";
import { findNamed } from "./wait.ts";
import { apiError, procedures } from "./web-mocks.ts";

/** Support des tests de création de projet (TK-48 / 48c). Les `vi.mock` restent dans chaque fichier de test. */
export const PROJECT_ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
export const ALPHA = { id: PROJECT_ID, name: "Alpha" };
export const REPO = {
  id: "01900000-0000-7000-8000-0000000000f1",
  projectId: PROJECT_ID,
  installationId: INSTALL_ID_1,
  role: "spec",
  mode: "new",
  ownerLogin: "acme-corp",
  name: "alpha-spec",
  defaultBranch: "main",
  specPath: ".koklo",
};

export const ACME = installation({ id: INSTALL_ID_1, ownerLogin: "acme-corp" });

/** Propriétaire, une installation active par défaut, création de projet et de dépôt qui réussissent. */
export function setupCreation(installations: unknown[] = [ACME]): void {
  asRole("owner");
  sessionStorage.clear();
  procedures.installationList.mockResolvedValue(installations);
  procedures.projectList.mockResolvedValueOnce([]).mockResolvedValue([ALPHA]);
  procedures.projectCreate.mockResolvedValue(ALPHA);
  procedures.repoCreateSpec.mockResolvedValue(REPO);
}

export const rejectWith = (code: string, data?: unknown) => () =>
  Promise.reject(data === undefined ? apiError(code) : apiError(code, data));

export function renderProjects() {
  return renderWithQuery(<ProjectsPage />);
}

export async function openSheet(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByTestId("create-project-button"));
  await screen.findByTestId("create-project-sheet");
  return screen.getByRole("dialog", { name: "Créer un projet" });
}

/** Ouvre le panneau et attend que la liste des comptes soit connue (le bouton « Créer le projet » est actif). */
export async function openReadySheet(): Promise<HTMLElement> {
  const sheet = await openSheet();
  await waitFor(() =>
    expect(within(sheet).getByRole("button", { name: "Créer le projet" })).toBeEnabled(),
  );
  return sheet;
}

export async function typeInto(sheet: HTMLElement, label: string, value: string): Promise<void> {
  await userEvent.type(within(sheet).getByLabelText(label), value);
}

export async function submit(sheet: HTMLElement): Promise<void> {
  await userEvent.click(within(sheet).getByRole("button", { name: "Créer le projet" }));
}

/** Saisit le nom (et le nom de dépôt) puis envoie. */
export async function createProject(
  sheet: HTMLElement,
  name = "Alpha",
  repoName?: string,
): Promise<void> {
  await typeInto(sheet, "Nom du projet", name);
  if (repoName) await typeInto(sheet, "Nom du dépôt (facultatif)", repoName);
  await submit(sheet);
}

/** Crée le projet (étape 1 réussie) et attend l'alerte de l'échec de l'étape 2. */
export async function createWithSpecFailure(
  error: () => Promise<never>,
  repoName?: string,
): Promise<HTMLElement> {
  procedures.repoCreateSpec.mockImplementation(error);
  const sheet = await openReadySheet();
  await createProject(sheet, "Alpha", repoName);
  const alert = await within(sheet).findByRole("alert");
  expect(alert).toHaveTextContent("Projet créé, dépôt de spec non créé");
  return sheet;
}

export const stepItem = (sheet: HTMLElement, index: 0 | 1): HTMLElement =>
  within(within(sheet).getByRole("list", { name: "Étapes de la création" })).getAllByRole(
    "listitem",
  )[index] as HTMLElement;

export const button = (scope: HTMLElement, name: string | RegExp): Promise<HTMLElement> =>
  findNamed("button", name, { scope: within(scope) });

export { INSTALL_ID_1 };
