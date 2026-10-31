import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATION_RESUME_KEY } from "../src/lib/creation-resume.ts";
import { asRole, INSTALL_ID_1 } from "./support/github-fixtures.ts";
import {
  ALPHA,
  createWithSpecFailure,
  PROJECT_ID,
  REPO,
  rejectWith,
  renderProjects,
  setupCreation,
  stepItem,
} from "./support/project-create.tsx";
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

const NOTICE_TITLE = "Projet « Alpha » : dépôt de spec non créé";
const NOTICE_TEXT = "Le projet existe, mais son dépôt de spec n'a pas encore été créé.";
const unavailable = rejectWith("PROVIDER_UNAVAILABLE");

const marker = (over: Record<string, unknown> = {}) => ({
  projectId: PROJECT_ID,
  projectName: "Alpha",
  installationId: INSTALL_ID_1,
  savedAt: Date.now() - 60_000,
  ...over,
});
const storeMarker = (value: unknown) =>
  sessionStorage.setItem(
    CREATION_RESUME_KEY,
    typeof value === "string" ? value : JSON.stringify(value),
  );
const resumeButton = () => screen.findByRole("button", { name: "Reprendre" });
/** L'action qui lance `createSpec` seul à la reprise : « Réessayer » ou « Créer le dépôt » (libellé non figé par la fiche). */
const RESUME_SUBMIT = /^(Réessayer|Créer le dépôt)/;

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  setupCreation();
  procedures.projectList.mockReset();
  procedures.projectList.mockResolvedValue([ALPHA]);
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Notice de reprise sur la page — après fermeture du panneau (§5.2)", () => {
  async function closeAfterFailure(): Promise<void> {
    procedures.projectList.mockReset();
    procedures.projectList.mockResolvedValueOnce([]).mockResolvedValue([ALPHA]);
    renderProjects();
    const sheet = await createWithSpecFailure(unavailable);
    await userEvent.click(within(sheet).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  }

  it("affiche une alerte « Projet « Alpha » : dépôt de spec non créé » avec Reprendre et Ignorer, focus sur Reprendre", async () => {
    await closeAfterFailure();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(NOTICE_TITLE);
    expect(alert).toHaveTextContent(NOTICE_TEXT);
    expect(within(alert).getByRole("button", { name: "Reprendre" })).toBeEnabled();
    expect(within(alert).getByRole("button", { name: "Ignorer" })).toBeEnabled();
    expect(await resumeButton()).toHaveFocus();
  });

  it("persiste dans sessionStorage, sans secret", async () => {
    await closeAfterFailure();
    const stored = JSON.parse(sessionStorage.getItem(CREATION_RESUME_KEY) ?? "null");
    expect(stored).toMatchObject({
      projectId: PROJECT_ID,
      projectName: "Alpha",
      installationId: INSTALL_ID_1,
    });
    expect(JSON.stringify(stored)).not.toMatch(/token|secret|state=|github\.com/i);
  });

  it("« Reprendre » rouvre le panneau à l'étape 2 : projet en lecture seule, aucun champ nom, étape 1 « Terminé »", async () => {
    await closeAfterFailure();
    await userEvent.click(await resumeButton());
    const sheet = await screen.findByRole("dialog", { name: "Créer un projet" });
    expect(within(sheet).queryByLabelText("Nom du projet")).not.toBeInTheDocument();
    expect(sheet).toHaveTextContent("Projet « Alpha »");
    expect(stepItem(sheet, 0)).toHaveTextContent("Terminé");
    expect(stepItem(sheet, 1)).not.toHaveTextContent("Terminé");
  });

  it("reprise réussie : createSpec seul (project.create jamais rappelé), annonce de succès, notice et marqueur effacés", async () => {
    await closeAfterFailure();
    procedures.repoCreateSpec.mockReset();
    procedures.repoCreateSpec.mockResolvedValue(REPO);
    await userEvent.click(await resumeButton());
    const sheet = await screen.findByRole("dialog", { name: "Créer un projet" });
    await userEvent.click(await within(sheet).findByRole("button", { name: RESUME_SUBMIT }));
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(1));
    expect(procedures.repoCreateSpec.mock.calls[0]?.[0]).toMatchObject({
      projectId: PROJECT_ID,
      installationId: INSTALL_ID_1,
    });
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Projet « Alpha » et dépôt de spec créés.",
    );
    expect(screen.queryByRole("button", { name: "Reprendre" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(CREATION_RESUME_KEY)).toBeNull();
  });

  it("« Ignorer » efface le marqueur et la notice, le focus passe au bouton « Créer un projet »", async () => {
    await closeAfterFailure();
    await userEvent.click(await screen.findByRole("button", { name: "Ignorer" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Reprendre" })).not.toBeInTheDocument(),
    );
    expect(sessionStorage.getItem(CREATION_RESUME_KEY)).toBeNull();
    expect(screen.getByTestId("create-project-button")).toHaveFocus();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas du marqueur au chargement, un test par cas
describe("Marqueur de reprise au chargement de /projects (§5.1)", () => {
  it("marqueur valide (< 1 h, projet connu de project.list) : notice à la place de l'état éphémère, annoncée en role=alert", async () => {
    storeMarker(marker());
    renderProjects();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(NOTICE_TITLE);
    expect(within(alert).getByRole("button", { name: "Reprendre" })).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Ignorer" })).toBeInTheDocument();
  });

  it("la notice est au-dessus du tableau des projets", async () => {
    storeMarker(marker());
    renderProjects();
    const alert = await screen.findByRole("alert");
    const table = await screen.findByRole("table", { name: "Liste des projets" });
    expect(alert.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("depuis ce marqueur, « Reprendre » appelle createSpec seul avec le projet et le compte du marqueur", async () => {
    storeMarker(marker({ repoName: "mon-depot" }));
    renderProjects();
    await userEvent.click(await resumeButton());
    const sheet = await screen.findByRole("dialog", { name: "Créer un projet" });
    await userEvent.click(await within(sheet).findByRole("button", { name: RESUME_SUBMIT }));
    await waitFor(() => expect(procedures.repoCreateSpec).toHaveBeenCalledTimes(1));
    expect(procedures.repoCreateSpec.mock.calls[0]?.[0]).toEqual({
      projectId: PROJECT_ID,
      installationId: INSTALL_ID_1,
      name: "mon-depot",
    });
    expect(procedures.projectCreate).not.toHaveBeenCalled();
  });

  it("projectId absent de project.list : marqueur ignoré, pas de notice", async () => {
    storeMarker(marker({ projectId: "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b77" }));
    renderProjects();
    await screen.findByRole("table", { name: "Liste des projets" });
    expect(screen.queryByRole("button", { name: "Reprendre" })).not.toBeInTheDocument();
  });

  it("marqueur expiré (> 1 h) : pas de notice", async () => {
    storeMarker(marker({ savedAt: Date.now() - 61 * 60_000 }));
    renderProjects();
    await screen.findByRole("table", { name: "Liste des projets" });
    expect(screen.queryByRole("button", { name: "Reprendre" })).not.toBeInTheDocument();
  });

  it.each([
    ["JSON malformé", "{pas du json"],
    ["uuid invalide", JSON.stringify(marker({ projectId: "42" }))],
    ["champ en trop", JSON.stringify(marker({ accessToken: "ghu_x" }))],
  ])("marqueur invalide (%s) : ignoré sans erreur", async (_label, value) => {
    storeMarker(value);
    renderProjects();
    await screen.findByRole("table", { name: "Liste des projets" });
    expect(screen.queryByRole("button", { name: "Reprendre" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sessionStorage indisponible : la page se charge normalement, sans notice ni erreur", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    renderProjects();
    await screen.findByRole("table", { name: "Liste des projets" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("rôle sans droit de création : aucune notice de reprise", async () => {
    asRole("dev");
    storeMarker(marker());
    renderProjects();
    await screen.findByRole("table", { name: "Liste des projets" });
    expect(screen.queryByRole("button", { name: "Reprendre" })).not.toBeInTheDocument();
  });
});
