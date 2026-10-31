import { act, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubPage } from "../src/components/github-page.tsx";
import {
  asRole,
  GITHUB_URL,
  INSTALL_BUTTON,
  INSTALL_ID_1,
  INSTALL_ID_2,
  installation,
  START_REPLY,
} from "./support/github-fixtures.ts";
import { renderWithQuery } from "./support/render.tsx";
import { findNamed } from "./support/wait.ts";
import { apiError, polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

const ROWS = [
  installation({ id: INSTALL_ID_1, ownerLogin: "acme-corp", userAuthorization: "absent" }),
  installation({ id: INSTALL_ID_2, ownerLogin: "vieux-studio", userAuthorization: "expired" }),
];

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  assignLocation.mockReset();
  asRole("owner");
  procedures.installationList.mockResolvedValue([]);
  procedures.installationStart.mockResolvedValue(START_REPLY);
});

const startInput = (call = 0) => procedures.installationStart.mock.calls[call]?.[0];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas du bouton, un test par comportement
describe("S-github — « Installer l'application GitHub » (AC-48-15)", () => {
  it("appelle installation.start sans installationId puis navigue vers l'URL reçue, telle quelle", async () => {
    renderWithQuery(<GithubPage />);
    await userEvent.click(await findNamed("button", INSTALL_BUTTON));
    await waitFor(() => expect(assignLocation).toHaveBeenCalledWith(GITHUB_URL));
    expect(startInput()).toEqual({});
    expect(assignLocation).toHaveBeenCalledTimes(1);
  });

  it("un double clic ne produit qu'un seul appel installation.start et une seule navigation", async () => {
    renderWithQuery(<GithubPage />);
    await userEvent.dblClick(await findNamed("button", INSTALL_BUTTON));
    await waitFor(() => expect(assignLocation).toHaveBeenCalled());
    expect(procedures.installationStart).toHaveBeenCalledTimes(1);
    expect(assignLocation).toHaveBeenCalledTimes(1);
  });

  it("pendant la redirection : bouton désactivé aria-busy « Redirection vers GitHub… » et role=status", async () => {
    renderWithQuery(<GithubPage />);
    await userEvent.click(await findNamed("button", INSTALL_BUTTON));
    const busy = await findNamed("button", "Redirection vers GitHub…");
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(
      screen
        .getAllByRole("status")
        .some((el) => el.textContent?.includes("Redirection vers GitHub…")),
    ).toBe(true);
  });

  it("les autres boutons de la page sont désactivés pendant la redirection", async () => {
    procedures.installationList.mockResolvedValue(ROWS);
    renderWithQuery(<GithubPage />);
    await screen.findByRole("heading", { level: 2, name: "acme-corp" });
    await userEvent.click(screen.getByRole("button", { name: INSTALL_BUTTON }));
    await findNamed("button", "Redirection vers GitHub…");
    expect(screen.getByRole("button", { name: "Autoriser Koklo sur acme-corp" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Réautoriser Koklo sur vieux-studio" }),
    ).toBeDisabled();
  });

  it("le bouton est réarmé au retour par le cache de navigation (pageshow persisted)", async () => {
    renderWithQuery(<GithubPage />);
    await userEvent.click(await findNamed("button", INSTALL_BUTTON));
    await findNamed("button", "Redirection vers GitHub…");
    act(() => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    });
    expect(await findNamed("button", INSTALL_BUTTON)).toBeEnabled();
  });

  it.each([
    ["http", "http://github.com/apps/koklo/installations/new?state=x"],
    ["autre hôte", "https://evil.example/apps/koklo/installations/new?state=x"],
    ["hôte déguisé", "https://github.com.evil.example/x"],
    ["javascript:", "javascript:alert(1)"],
  ])(
    "URL reçue refusée (%s) : erreur « Impossible de lancer l'installation », aucune navigation, bouton réarmé",
    async (_label, url) => {
      procedures.installationStart.mockResolvedValue({ ...START_REPLY, url });
      renderWithQuery(<GithubPage />);
      await userEvent.click(await findNamed("button", INSTALL_BUTTON));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Impossible de lancer l'installation");
      expect(assignLocation).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: INSTALL_BUTTON })).toBeEnabled();
      expect(screen.getByTestId("github-page").textContent).not.toContain(url);
    },
  );
});

describe("S-github — « Autoriser » / « Réautoriser » (AC-48-15)", () => {
  it("« Autoriser » appelle installation.start avec l'installationId de la ligne puis navigue", async () => {
    procedures.installationList.mockResolvedValue(ROWS);
    renderWithQuery(<GithubPage />);
    await userEvent.click(
      await findNamed("button", "Autoriser Koklo sur acme-corp", { text: "Autoriser" }),
    );
    await waitFor(() => expect(assignLocation).toHaveBeenCalledWith(GITHUB_URL));
    expect(startInput()).toEqual({ installationId: INSTALL_ID_1 });
  });

  it("« Réautoriser » vise l'installation expirée, un seul appel même en double clic", async () => {
    procedures.installationList.mockResolvedValue(ROWS);
    renderWithQuery(<GithubPage />);
    await userEvent.dblClick(
      await findNamed("button", "Réautoriser Koklo sur vieux-studio", { text: "Réautoriser" }),
    );
    await waitFor(() => expect(assignLocation).toHaveBeenCalled());
    expect(procedures.installationStart).toHaveBeenCalledTimes(1);
    expect(startInput()).toEqual({ installationId: INSTALL_ID_2 });
  });

  it("une seule action en vol : cliquer « Autoriser » puis une autre ligne n'ajoute aucun appel", async () => {
    procedures.installationList.mockResolvedValue(ROWS);
    procedures.installationStart.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<GithubPage />);
    await userEvent.click(
      await findNamed("button", "Autoriser Koklo sur acme-corp", { text: "Autoriser" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Réautoriser Koklo sur vieux-studio" }),
    );
    expect(procedures.installationStart).toHaveBeenCalledTimes(1);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'erreurs typées, un test par comportement
describe("S-github — erreurs de installation.start (role=alert, boutons réarmés)", () => {
  async function failWith(error: unknown) {
    procedures.installationStart.mockImplementationOnce(() => Promise.reject(error));
    renderWithQuery(<GithubPage />);
    await userEvent.click(await findNamed("button", INSTALL_BUTTON));
    return screen.findByRole("alert");
  }

  it("PROVIDER_UNAVAILABLE : non disponible pour le moment", async () => {
    const alert = await failWith(apiError("PROVIDER_UNAVAILABLE"));
    expect(alert).toHaveTextContent("L'installation n'est pas disponible pour le moment");
    expect(alert).toHaveTextContent(
      "L'application GitHub n'est pas configurée sur cet environnement",
    );
    expect(screen.getByRole("button", { name: INSTALL_BUTTON })).toBeEnabled();
    expect(assignLocation).not.toHaveBeenCalled();
  });

  it("VALIDATION too_many_pending : trop de tentatives, attendre 10 minutes", async () => {
    const alert = await failWith(
      apiError("VALIDATION", { field: "installationId", message: "too_many_pending" }),
    );
    expect(alert).toHaveTextContent("Trop de tentatives en cours");
    expect(alert).toHaveTextContent("Attendez 10 minutes puis réessayez.");
    expect(screen.getByRole("button", { name: INSTALL_BUTTON })).toBeEnabled();
  });

  it("NOT_FOUND : « Cette installation n'existe plus » et rechargement de la liste", async () => {
    const alert = await failWith(apiError("NOT_FOUND"));
    expect(alert).toHaveTextContent("Cette installation n'existe plus");
    expect(alert).toHaveTextContent("Rechargez la page pour voir la liste à jour.");
    await waitFor(() => expect(procedures.installationList.mock.calls.length).toBeGreaterThan(1));
  });

  it("FORBIDDEN : même message que le refus direct, en alerte", async () => {
    const alert = await failWith(apiError("FORBIDDEN"));
    expect(alert).toHaveTextContent(
      "Cette page est réservée aux propriétaires et aux administrateurs.",
    );
  });

  it.each([
    ["INTERNAL", apiError("INTERNAL")],
    ["réseau", new TypeError("fetch failed")],
  ])(
    "autre erreur (%s) : « Impossible de lancer l'installation » avec le texte générique",
    async (_label, error) => {
      const alert = await failWith(error);
      expect(alert).toHaveTextContent("Impossible de lancer l'installation");
      expect(alert).toHaveTextContent(
        "Une erreur est survenue. Vérifiez votre connexion puis réessayez.",
      );
    },
  );

  it("l'erreur est au-dessus de la liste et disparaît au prochain clic d'action", async () => {
    procedures.installationList.mockResolvedValue(ROWS);
    procedures.installationStart.mockImplementationOnce(() =>
      Promise.reject(apiError("PROVIDER_UNAVAILABLE")),
    );
    renderWithQuery(<GithubPage />);
    await userEvent.click(await findNamed("button", INSTALL_BUTTON));
    const alert = await screen.findByRole("alert");
    const list = screen.getByRole("list", { name: "Installations GitHub" });
    expect(alert.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Autoriser Koklo sur acme-corp" }));
    await waitFor(() => expect(within(document.body).queryByRole("alert")).toBeNull());
  });
});
