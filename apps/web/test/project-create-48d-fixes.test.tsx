import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACME,
  createProject,
  openReadySheet,
  rejectWith,
  renderProjects,
  setupCreation,
} from "./support/project-create.tsx";
import {
  getSession,
  NO_SESSION,
  navigations,
  polyfillRadix,
  procedures,
  resetWebMocks,
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

/**
 * TK-48 / 48d : les deux non bloquants de la revue 48c corrigés dans le panneau réutilisé
 * (design/screens/S-features.md §9) : compte disparu puis fermeture, texte d'erreur pendant la redirection.
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setupCreation();
});

describe("Panneau de création — non bloquants de 48c", () => {
  it("compte sélectionné disparu puis fermeture : jamais « Projet créé. » sans dépôt", async () => {
    procedures.installationList.mockResolvedValueOnce([ACME]).mockResolvedValue([]);
    procedures.repoCreateSpec.mockImplementation(rejectWith("NOT_FOUND"));
    renderProjects();
    const sheet = await openReadySheet();
    await createProject(sheet, "Alpha");
    await within(sheet).findByRole("alert");
    await waitFor(() => expect(procedures.installationList).toHaveBeenCalledTimes(2));
    await userEvent.click(within(sheet).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const announcement = screen.getByRole("status");
    expect(announcement).not.toHaveTextContent(/Projet « Alpha » créé\./);
    expect(announcement).toHaveTextContent("Projet « Alpha » créé, sans dépôt de spec.");
  });

  it("UNAUTHORIZED à l'étape 1 : redirection sans texte d'erreur générique", async () => {
    procedures.projectCreate.mockImplementation(rejectWith("UNAUTHORIZED"));
    renderProjects();
    const sheet = await openReadySheet();
    getSession.mockResolvedValue(NO_SESSION);
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(navigations()).toContain("/login"));
    expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument();
    expect(sheet).not.toHaveTextContent("n'a pas pu être créé");
  });

  it("UNAUTHORIZED à l'étape 2 : le panneau reste sur « Créer le dépôt », sans alerte", async () => {
    procedures.repoCreateSpec.mockImplementation(rejectWith("UNAUTHORIZED"));
    renderProjects();
    const sheet = await openReadySheet();
    getSession.mockResolvedValue(NO_SESSION);
    await createProject(sheet, "Alpha");
    await waitFor(() => expect(navigations()).toContain("/login"));
    expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Créer le dépôt" })).toBeEnabled();
  });
});
