import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembersPage } from "../src/components/members-page.tsx";
import { asRole, PAGE, ROWS, seedMembers } from "./support/members-fixtures.ts";
import { renderWithQuery } from "./support/render.tsx";
import {
  apiError,
  getSession,
  navigations,
  organization,
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

const TEAM_ONLY = "La liste des membres est réservée à l'équipe.";

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  seedMembers();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("Membres : tableau paginé", () => {
  it("annonce le chargement sans bloquer le formulaire", async () => {
    procedures.memberPage.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<MembersPage />);
    const label = await screen.findByText("Chargement des membres…");
    expect(label.closest("[role=status]")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByLabelText("Adresse e-mail")).toBeInTheDocument();
  });

  it("demande la première page de 25 et rend nom, e-mail, rôle, projets et dernière activité", async () => {
    renderWithQuery(<MembersPage />);
    await screen.findByText("Moussa Diallo");
    expect(procedures.memberPage.mock.calls[0]?.[0]).toEqual({ page: 1, size: 25 });
    expect(screen.getByRole("table", { name: "Liste des membres" })).toBeInTheDocument();
    for (const name of ["Membre", "Rôle", "Projets", "Dernière activité"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    const client = screen.getByText("Nadia Client").closest("tr") as HTMLElement;
    expect(within(client).getByText("nadia@example.com")).toBeInTheDocument();
    expect(within(client).getByText("Client")).toBeInTheDocument();
    expect(within(client).getByText("Portail de réservation")).toBeInTheDocument();
    expect(within(client).getByText("4 nov. 2026")).toBeInTheDocument();
    const dev = screen.getByText("Moussa Diallo").closest("tr") as HTMLElement;
    expect(within(dev).getByText("Jamais connecté")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Membres" })).toBeInTheDocument();
  });

  it("compteur « N membres » du total réel et pagination numérotée", async () => {
    procedures.memberPage.mockResolvedValue({ items: ROWS, total: 60, totalIsEstimate: false });
    renderWithQuery(<MembersPage />);
    expect(await screen.findByText("60 membres")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 3" })).toBeInTheDocument();
  });

  it("changer de page redemande member.page avec le numéro choisi", async () => {
    procedures.memberPage.mockResolvedValue({ items: ROWS, total: 60, totalIsEstimate: false });
    renderWithQuery(<MembersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Page 2" }));
    await waitFor(() =>
      expect(procedures.memberPage).toHaveBeenLastCalledWith({ page: 2, size: 25 }),
    );
  });

  it("erreur de liste : Alert « Impossible de charger les membres » et « Réessayer »", async () => {
    procedures.memberPage.mockImplementationOnce(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<MembersPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de charger les membres");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Moussa Diallo")).toBeInTheDocument();
  });

  it("session sans organisation active (UNAUTHORIZED) : /organizations, jamais /login", async () => {
    procedures.memberPage.mockImplementation(() => Promise.reject(apiError("UNAUTHORIZED")));
    getSession.mockResolvedValue(sessionWith(null));
    renderWithQuery(<MembersPage />);
    await waitFor(() => expect(navigations()).toContain("/organizations"));
    expect(navigations()).not.toContain("/login");
  });
});

describe("Membres : droits selon le rôle", () => {
  it("client : member.page n'est pas appelé, message d'accès réservé, ni liste ni formulaire", async () => {
    asRole("client");
    renderWithQuery(<MembersPage />);
    expect(await screen.findByText(TEAM_ONLY)).toBeInTheDocument();
    expect(procedures.memberPage).not.toHaveBeenCalled();
    expect(procedures.invitationList).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Adresse e-mail")).not.toBeInTheDocument();
  });

  it("organization.list en échec : rôle inconnu = non autorisé, aucun appel", async () => {
    getSession.mockResolvedValue(sessionWith(organization().id));
    procedures.organizationList.mockImplementation(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<MembersPage />);
    expect(await screen.findByText(TEAM_ONLY)).toBeInTheDocument();
    expect(procedures.memberPage).not.toHaveBeenCalled();
  });

  it.each(["dev", "designer", "business"])(
    "rôle %s : liste visible, aucune action (ni formulaire, ni menu, ni invitations en attente)",
    async (role) => {
      asRole(role);
      renderWithQuery(<MembersPage />);
      await screen.findByText("Moussa Diallo");
      expect(screen.queryByLabelText("Adresse e-mail")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Inviter" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Actions pour/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
      expect(procedures.invitationList).not.toHaveBeenCalled();
      expect(screen.queryByText(/Invitations en attente/)).not.toBeInTheDocument();
    },
  );

  it("propriétaire : formulaire, menus d'actions et invitations en attente", async () => {
    renderWithQuery(<MembersPage />);
    expect(await screen.findByLabelText("Adresse e-mail")).toBeInTheDocument();
    expect(await screen.findByText("Invitations en attente · 2")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Actions pour Moussa Diallo" })).toBeVisible();
  });
});

describe("Membres : matrice « Ce que chaque rôle peut faire »", () => {
  it("9 actions x 6 rôles, une coche ou un tiret nommé par cellule", async () => {
    asRole("dev");
    renderWithQuery(<MembersPage />);
    const summary = await screen.findByText("Ce que chaque rôle peut faire");
    expect(summary.closest("details")).not.toBeNull();
    const region = screen.getByRole("region", { name: "Ce que chaque rôle peut faire" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(within(region).getAllByRole("row")).toHaveLength(10);
    expect(within(region).getAllByRole("columnheader")).toHaveLength(7);
    const cells = within(region).getAllByRole("cell", { name: /: (oui|non)$/ });
    expect(cells).toHaveLength(54);
    const row = within(region).getByText("Gérer les tickets et les sprints").closest("tr");
    expect(
      within(row as HTMLElement).getByRole("cell", { name: "Développeur : oui" }),
    ).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByRole("cell", { name: "Client : non" }),
    ).toBeInTheDocument();
  });

  it("visible aussi du propriétaire, après le tableau", async () => {
    renderWithQuery(<MembersPage />);
    expect(await screen.findByText("Ce que chaque rôle peut faire")).toBeInTheDocument();
  });

  it("n'apparaît pas quand la liste est refusée (client)", async () => {
    asRole("client");
    renderWithQuery(<MembersPage />);
    await screen.findByText(TEAM_ONLY);
    expect(screen.queryByText("Ce que chaque rôle peut faire")).not.toBeInTheDocument();
    expect(PAGE.total).toBe(3);
  });
});
