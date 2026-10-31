import { waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATION_RESUME_KEY } from "../src/lib/creation-resume.ts";
import { GITHUB_URL, INSTALL_ID_1, START_REPLY } from "./support/github-fixtures.ts";
import {
  createWithSpecFailure,
  PROJECT_ID,
  rejectWith,
  renderProjects,
  setupCreation,
} from "./support/project-create.tsx";
import { findNamed } from "./support/wait.ts";
import { polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

const assignLocation = vi.hoisted(() => vi.fn());

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
// Seule la navigation du navigateur est simulée : la validation de l'URL reste réelle.
vi.mock("../src/lib/github-redirect.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/github-redirect.ts")>()),
  assignLocation,
}));

const tokenRequired = rejectWith("USER_TOKEN_REQUIRED", { ownerLogin: "acme-corp" });
const AUTHORIZE = "Autoriser Koklo sur acme-corp";
const storedMarker = () => JSON.parse(sessionStorage.getItem(CREATION_RESUME_KEY) ?? "null");

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  assignLocation.mockReset();
  setupCreation();
  procedures.installationStart.mockResolvedValue(START_REPLY);
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas de l'autorisation, un test par comportement
describe("« Autoriser Koklo » depuis l'échec partiel (AC-48-21)", () => {
  it("appelle installation.start({ installationId }) une seule fois (double clic) puis navigue vers l'URL reçue", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(tokenRequired);
    await userEvent.dblClick(within(sheet).getByRole("button", { name: AUTHORIZE }));
    await waitFor(() => expect(assignLocation).toHaveBeenCalledWith(GITHUB_URL));
    expect(procedures.installationStart).toHaveBeenCalledTimes(1);
    expect(procedures.installationStart.mock.calls[0]?.[0]).toEqual({
      installationId: INSTALL_ID_1,
    });
    expect(assignLocation).toHaveBeenCalledTimes(1);
    expect(procedures.projectCreate).toHaveBeenCalledTimes(1);
  });

  it("le texte visible du bouton est « Autoriser Koklo » (le login n'est que dans le nom accessible)", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(tokenRequired);
    const authorize = within(sheet).getByRole("button", { name: AUTHORIZE });
    expect(authorize).toHaveTextContent("Autoriser Koklo");
  });

  it("écrit le marqueur de reprise : projet, compte, nom du dépôt, horodatage ; aucun jeton, état, code ni URL", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(tokenRequired, "mon-depot");
    const before = Date.now();
    await userEvent.click(within(sheet).getByRole("button", { name: AUTHORIZE }));
    await waitFor(() => expect(assignLocation).toHaveBeenCalled());
    const marker = storedMarker();
    expect(marker).toMatchObject({
      projectId: PROJECT_ID,
      projectName: "Alpha",
      installationId: INSTALL_ID_1,
      repoName: "mon-depot",
    });
    expect(marker.savedAt).toBeGreaterThanOrEqual(before - 1_000);
    expect(marker.savedAt).toBeLessThanOrEqual(Date.now() + 1_000);
    expect(Object.keys(marker).sort()).toEqual(
      ["installationId", "projectId", "projectName", "repoName", "savedAt"].sort(),
    );
    const raw = sessionStorage.getItem(CREATION_RESUME_KEY) ?? "";
    expect(raw).not.toContain("github.com");
    expect(raw).not.toContain("state=");
    expect(raw).not.toContain(GITHUB_URL);
  });

  it("sans nom de dépôt saisi : le marqueur n'a pas de repoName", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(tokenRequired);
    await userEvent.click(within(sheet).getByRole("button", { name: AUTHORIZE }));
    await waitFor(() => expect(assignLocation).toHaveBeenCalled());
    expect(Object.keys(storedMarker())).not.toContain("repoName");
  });

  it("REPO_CREATION_FORBIDDEN missing-user-token mène à la même autorisation", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(
      rejectWith("REPO_CREATION_FORBIDDEN", {
        reason: "missing-user-token",
        ownerLogin: "acme-corp",
        ownerKind: "organization",
      }),
    );
    await userEvent.click(within(sheet).getByRole("button", { name: AUTHORIZE }));
    await waitFor(() => expect(assignLocation).toHaveBeenCalledWith(GITHUB_URL));
    expect(procedures.installationStart).toHaveBeenCalledTimes(1);
  });

  it("PROVIDER_AUTH_EXPIRED kind user : « Réautoriser Koklo » mène à la même autorisation", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(
      rejectWith("PROVIDER_AUTH_EXPIRED", { kind: "user", refreshable: false }),
    );
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Réautoriser Koklo sur acme-corp" }),
    );
    await waitFor(() => expect(assignLocation).toHaveBeenCalledWith(GITHUB_URL));
    expect(procedures.installationStart.mock.calls[0]?.[0]).toEqual({
      installationId: INSTALL_ID_1,
    });
  });

  it("pendant la redirection : bouton désactivé aria-busy « Redirection vers GitHub… », fermeture bloquée", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(tokenRequired);
    await userEvent.click(within(sheet).getByRole("button", { name: AUTHORIZE }));
    const busy = await findNamed("button", "Redirection vers GitHub…", { scope: within(sheet) });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    await userEvent.keyboard("{Escape}");
    expect(within(sheet).getByRole("alert")).toBeInTheDocument();
  });

  it.each([
    ["http", "http://github.com/apps/koklo/installations/new?state=x"],
    ["autre hôte", "https://evil.example/apps/koklo/installations/new?state=x"],
    ["hôte déguisé", "https://github.com.evil.example/x"],
    ["javascript:", "javascript:alert(1)"],
  ])(
    "URL reçue refusée (%s) : aucune navigation, erreur lisible, bouton réarmé",
    async (_label, url) => {
      procedures.installationStart.mockResolvedValue({ ...START_REPLY, url });
      renderProjects();
      const sheet = await createWithSpecFailure(tokenRequired);
      await userEvent.click(within(sheet).getByRole("button", { name: AUTHORIZE }));
      await within(sheet).findByText("Impossible de lancer l'installation");
      expect(assignLocation).not.toHaveBeenCalled();
      expect(within(sheet).getByRole("button", { name: AUTHORIZE })).toBeEnabled();
      expect(sheet.textContent).not.toContain(url);
    },
  );

  it("installation.start en 503 : message d'indisponibilité, aucune navigation, bouton réarmé", async () => {
    procedures.installationStart.mockImplementation(rejectWith("PROVIDER_UNAVAILABLE"));
    renderProjects();
    const sheet = await createWithSpecFailure(tokenRequired);
    await userEvent.click(within(sheet).getByRole("button", { name: AUTHORIZE }));
    await within(sheet).findByText("L'installation n'est pas disponible pour le moment");
    expect(assignLocation).not.toHaveBeenCalled();
    expect(within(sheet).getByRole("button", { name: AUTHORIZE })).toBeEnabled();
  });

  it("sessionStorage indisponible : l'écriture du marqueur ne bloque jamais la navigation", async () => {
    renderProjects();
    const sheet = await createWithSpecFailure(tokenRequired);
    const boom = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    await userEvent.click(within(sheet).getByRole("button", { name: AUTHORIZE }));
    await waitFor(() => expect(assignLocation).toHaveBeenCalledWith(GITHUB_URL));
    vi.restoreAllMocks();
  });
});
