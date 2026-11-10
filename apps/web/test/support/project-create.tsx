import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect } from "vitest";
import { ProjectsPage } from "../../src/components/projects-page.tsx";
import { asRole, INSTALL_ID_1, installation } from "./github-fixtures.ts";
import { renderWithQuery } from "./render.tsx";
import { apiError, cardsPage, procedures, projectCard } from "./web-mocks.ts";

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

/** Propriétaire, une installation active par défaut, création de projet qui réussit. */
export function setupCreation(installations: unknown[] = [ACME]): void {
  asRole("owner");
  procedures.installationList.mockResolvedValue(installations);
  procedures.projectCards
    .mockResolvedValueOnce(cardsPage([]))
    .mockResolvedValue(cardsPage([projectCard(ALPHA)]));
  procedures.projectCreate.mockResolvedValue(ALPHA);
  procedures.repoCreateSpec.mockResolvedValue(REPO);
}

export const rejectWith = (code: string, data?: unknown) => () =>
  Promise.reject(data === undefined ? apiError(code) : apiError(code, data));

export function renderProjects() {
  return renderWithQuery(<ProjectsPage />);
}

/** Ouvre la boîte « Nouveau projet » et attend que la liste des comptes soit connue (« Créer le projet » actif). */
export async function openDialog(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByTestId("create-project-button"));
  const dialog = await screen.findByRole("dialog", { name: "Nouveau projet" });
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "Créer le projet" })).toBeEnabled(),
  );
  return dialog;
}

export async function typeInto(dialog: HTMLElement, label: string, value: string): Promise<void> {
  await userEvent.type(within(dialog).getByLabelText(label), value);
}

export async function submit(dialog: HTMLElement): Promise<void> {
  await userEvent.click(within(dialog).getByRole("button", { name: "Créer le projet" }));
}

export { INSTALL_ID_1 };
