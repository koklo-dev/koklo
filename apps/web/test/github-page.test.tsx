import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubPage } from "../src/components/github-page.tsx";
import {
  asRole,
  INSTALL_BUTTON,
  INSTALL_ID_1,
  INSTALL_ID_2,
  INSTALL_ID_3,
  INSTALL_ID_4,
  installation,
} from "./support/github-fixtures.ts";
import { renderWithQuery } from "./support/render.tsx";
import { findNamed } from "./support/wait.ts";
import {
  apiError,
  getSession,
  navigations,
  polyfillRadix,
  procedures,
  resetWebMocks,
  sessionWith,
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

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  procedures.installationList.mockResolvedValue([]);
  asRole("owner");
});

const rowOf = (login: string): HTMLElement =>
  screen.getByRole("heading", { level: 2, name: login }).closest("li") as HTMLElement;

describe("S-github — chargement, vide, erreur (AC-48-14)", () => {
  it("annonce le chargement (role=status, aria-busy) et laisse le bouton d'installation disponible", async () => {
    procedures.installationList.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<GithubPage />);
    const label = await screen.findByText("Chargement des installations GitHub…");
    expect(label.closest("[role=status]")).toHaveAttribute("aria-busy", "true");
    expect(await findNamed("button", INSTALL_BUTTON)).toBeEnabled();
    expect(screen.getByRole("heading", { level: 1, name: "GitHub" })).toBeInTheDocument();
    expect(screen.getByTestId("github-page")).toBeInTheDocument();
  });

  it("liste vide : titre, explication et UN seul bouton « Installer l'application GitHub »", async () => {
    renderWithQuery(<GithubPage />);
    expect(await screen.findByText("Aucune application GitHub installée")).toBeInTheDocument();
    expect(
      screen.getByText(/Installez l'application pour que Koklo puisse créer le dépôt/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: INSTALL_BUTTON })).toHaveLength(1);
    expect(screen.getByText(/Il faut être propriétaire du compte GitHub/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Installations GitHub" })).not.toBeInTheDocument();
  });

  it("erreur de liste : alerte « Impossible de charger les installations », Réessayer relance, bouton d'installation conservé", async () => {
    procedures.installationList.mockImplementationOnce(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<GithubPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de charger les installations");
    expect(alert).toHaveTextContent(
      "Une erreur est survenue. Vérifiez votre connexion puis réessayez.",
    );
    expect(screen.getByRole("button", { name: INSTALL_BUTTON })).toBeEnabled();
    procedures.installationList.mockResolvedValue([installation()]);
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("heading", { level: 2, name: "acme-corp" })).toBeInTheDocument();
  });

  it("session sans organisation active (UNAUTHORIZED) : /organizations, jamais /login", async () => {
    procedures.installationList.mockImplementation(() => Promise.reject(apiError("UNAUTHORIZED")));
    getSession.mockResolvedValue(sessionWith(null));
    renderWithQuery(<GithubPage />);
    await waitFor(() => expect(navigations()).toContain("/organizations"));
    expect(navigations()).not.toContain("/login");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas de la liste, un test par comportement
describe("S-github — liste des installations (AC-48-14)", () => {
  beforeEach(() => {
    procedures.installationList.mockResolvedValue([
      installation({ id: INSTALL_ID_1, ownerLogin: "acme-corp" }),
      installation({
        id: INSTALL_ID_2,
        ownerKind: "user",
        ownerLogin: "awa-kone",
        userAuthorization: "absent",
      }),
      installation({
        id: INSTALL_ID_3,
        ownerLogin: "vieux-studio",
        userAuthorization: "expired",
      }),
      installation({ id: INSTALL_ID_4, ownerLogin: "pause-sa", status: "suspended" }),
      installation({
        id: "01900000-0000-7000-8000-0000000000e5",
        ownerLogin: "parti-sas",
        status: "deleted",
      }),
    ]);
  });

  it("rend une liste nommée « Installations GitHub » avec une entrée par installation et un compteur", async () => {
    renderWithQuery(<GithubPage />);
    await screen.findByRole("heading", { level: 2, name: "acme-corp" });
    const list = screen.getByRole("list", { name: "Installations GitHub" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("5 installations")).toBeInTheDocument();
  });

  it("chaque entrée : compte, type de compte, date longue ; en-tête avec le bouton d'installation", async () => {
    renderWithQuery(<GithubPage />);
    await screen.findByRole("heading", { level: 2, name: "acme-corp" });
    expect(within(rowOf("acme-corp")).getByText("Organisation GitHub")).toBeInTheDocument();
    expect(within(rowOf("awa-kone")).getByText("Compte personnel")).toBeInTheDocument();
    expect(
      within(rowOf("acme-corp")).getByText(/Installée le 20 octobre 2026/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: INSTALL_BUTTON })).toHaveLength(1);
  });

  it("statut d'installation : icône ET texte pour chaque valeur, jamais la couleur seule", async () => {
    renderWithQuery(<GithubPage />);
    await screen.findByRole("heading", { level: 2, name: "acme-corp" });
    for (const [login, label] of [
      ["acme-corp", "Active"],
      ["pause-sa", "Suspendue"],
      ["parti-sas", "Désinstallée"],
    ] as const) {
      const badge = within(rowOf(login)).getByText(label).closest("span") as HTMLElement;
      expect(badge, `${login}: statut sans icône`).toContainHTML("<svg");
      expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(badge).toHaveTextContent(label);
    }
  });

  it("autorisation d'une installation active : « Autorisée », « À autoriser », « Autorisation expirée » avec icône", async () => {
    renderWithQuery(<GithubPage />);
    await screen.findByRole("heading", { level: 2, name: "acme-corp" });
    for (const [login, label] of [
      ["acme-corp", "Autorisée"],
      ["awa-kone", "À autoriser"],
      ["vieux-studio", "Autorisation expirée"],
    ] as const) {
      const badge = within(rowOf(login)).getByText(label).closest("span") as HTMLElement;
      expect(badge.querySelector("svg"), `${login}: autorisation sans icône`).not.toBeNull();
    }
  });

  it("actions : « Autoriser » (absent) et « Réautoriser » (expiré) nommés avec le compte ; rien pour une autorisation active", async () => {
    renderWithQuery(<GithubPage />);
    await screen.findByRole("heading", { level: 2, name: "acme-corp" });
    expect(screen.getByRole("button", { name: "Autoriser Koklo sur awa-kone" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Réautoriser Koklo sur vieux-studio" }),
    ).toBeEnabled();
    expect(within(rowOf("acme-corp")).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(rowOf("acme-corp")).getByText("Koklo peut créer des dépôts sur ce compte."),
    ).toBeInTheDocument();
    expect(
      within(rowOf("awa-kone")).getByText(/n'a pas encore votre autorisation/),
    ).toBeInTheDocument();
    expect(
      within(rowOf("vieux-studio")).getByText("Votre autorisation a expiré."),
    ).toBeInTheDocument();
  });

  it("suspendue et désinstallée : texte explicatif, aucune action, aucune autorisation affichée", async () => {
    renderWithQuery(<GithubPage />);
    await screen.findByRole("heading", { level: 2, name: "acme-corp" });
    for (const [login, text] of [
      ["pause-sa", /Suspendue sur GitHub\. Réactivez-la depuis vos paramètres GitHub\./],
      ["parti-sas", /Désinstallée sur GitHub\. Réinstallez l'application/],
    ] as const) {
      const row = rowOf(login);
      expect(within(row).getByText(text)).toBeInTheDocument();
      expect(within(row).queryByRole("button")).not.toBeInTheDocument();
      expect(within(row).queryByText(/Autorisée|À autoriser|Autorisation expirée/)).toBeNull();
    }
  });

  it("une installation désinstallée est atténuée par muted-foreground, jamais par l'opacité", async () => {
    renderWithQuery(<GithubPage />);
    await screen.findByRole("heading", { level: 2, name: "parti-sas" });
    const row = rowOf("parti-sas");
    expect(row.className).not.toMatch(/\bopacity-/);
    expect(row.innerHTML).toContain("text-muted-foreground");
  });

  it("ne montre jamais d'identifiant externe, de jeton, d'état ni d'URL", async () => {
    renderWithQuery(<GithubPage />);
    await screen.findByRole("heading", { level: 2, name: "acme-corp" });
    const page = screen.getByTestId("github-page");
    expect(page.textContent).not.toMatch(/https?:\/\/|state=|token|jeton|oauth/i);
    expect(page.innerHTML).not.toContain(INSTALL_ID_1);
  });
});

describe("S-github — droits selon le rôle (AC-48-17)", () => {
  it.each(["owner", "admin"])(
    "rôle %s : appelle installation.list et propose l'installation",
    async (role) => {
      asRole(role);
      renderWithQuery(<GithubPage />);
      expect(await findNamed("button", INSTALL_BUTTON)).toBeEnabled();
      await waitFor(() => expect(procedures.installationList).toHaveBeenCalled());
    },
  );

  it.each(["dev", "designer", "client", "business"])(
    "rôle %s : message de réservation, aucun bouton, AUCUN appel installation.list",
    async (role) => {
      asRole(role);
      renderWithQuery(<GithubPage />);
      const notice = await screen.findByText(
        "Cette page est réservée aux propriétaires et aux administrateurs. Demandez à l'un d'eux de relier GitHub.",
      );
      expect(notice).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "GitHub" })).toBeInTheDocument();
      expect(screen.queryAllByRole("button")).toHaveLength(0);
      // Laisse passer d'éventuelles requêtes tardives avant d'affirmer l'absence d'appel.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(procedures.installationList).not.toHaveBeenCalled();
      expect(procedures.installationStart).not.toHaveBeenCalled();
    },
  );

  it("rôle inconnu : « Chargement… », ni message de droits, ni bouton, ni appel installation.list", async () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<GithubPage />);
    expect(await screen.findByText("Chargement…")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/réservée aux propriétaires/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: INSTALL_BUTTON })).not.toBeInTheDocument();
    expect(procedures.installationList).not.toHaveBeenCalled();
  });
});
