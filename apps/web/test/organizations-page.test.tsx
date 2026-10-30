import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationsPage } from "../src/components/organizations-page.tsx";
import { renderWithQuery } from "./support/render.tsx";
import { findNamed } from "./support/wait.ts";
import {
  apiError,
  getSession,
  navigations,
  ORG_ID,
  OTHER_ORG_ID,
  organization,
  polyfillRadix,
  procedures,
  resetWebMocks,
  sessionWith,
  setActive,
  signOut,
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

const GENERIC = "Une erreur est survenue. Vérifiez votre connexion puis réessayez.";

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  getSession.mockResolvedValue(sessionWith(null));
});

describe("S-organizations — chargement", () => {
  it("annonce le chargement (role=status, aria-busy) et n'affiche pas encore le formulaire", () => {
    procedures.organizationList.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<OrganizationsPage />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Chargement de vos organisations…");
    expect(screen.queryByLabelText("Nom de l'organisation")).not.toBeInTheDocument();
  });
});

describe("S-organizations — 0 organisation (état vide, premier login)", () => {
  beforeEach(() => {
    procedures.organizationList.mockResolvedValue([]);
  });

  it("affiche le titre, la phrase d'accueil et le formulaire de création seul", async () => {
    renderWithQuery(<OrganizationsPage />);
    expect(
      await findNamed("heading", "Créer votre organisation", { level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Une organisation regroupe vos projets et votre équipe. Vous en serez le propriétaire.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nom de l'organisation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer l'organisation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Ouvrir/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("organizations-page")).toBeInTheDocument();
  });

  it("ne mène jamais à /login quand une session existe (G1)", async () => {
    renderWithQuery(<OrganizationsPage />);
    await screen.findByLabelText("Nom de l'organisation");
    expect(navigations()).not.toContain("/login");
  });

  it("place le focus sur « Nom de l'organisation » quand il n'y a rien à choisir", async () => {
    renderWithQuery(<OrganizationsPage />);
    const field = await screen.findByLabelText("Nom de l'organisation");
    await waitFor(() => expect(field).toHaveFocus());
  });

  it("propose « Se déconnecter » et appelle signOut", async () => {
    signOut.mockResolvedValue({ data: {}, error: null });
    renderWithQuery(<OrganizationsPage />);
    await userEvent.click(await findNamed("button", "Se déconnecter"));
    expect(signOut).toHaveBeenCalled();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("S-organizations — création", () => {
  beforeEach(() => {
    procedures.organizationList.mockResolvedValue([]);
  });

  it("crée l'organisation avec le nom saisi puis navigue vers /projects", async () => {
    procedures.organizationCreate.mockResolvedValue(organization());
    renderWithQuery(<OrganizationsPage />);
    await userEvent.type(await screen.findByLabelText("Nom de l'organisation"), "Atelier Lumière");
    await userEvent.click(screen.getByRole("button", { name: "Créer l'organisation" }));
    await waitFor(() => expect(procedures.organizationCreate).toHaveBeenCalled());
    expect(procedures.organizationCreate.mock.calls[0]?.[0]).toEqual({ name: "Atelier Lumière" });
    await waitFor(() => expect(navigations()).toContain("/projects"));
  });

  it("Entrée dans le champ nom valide le formulaire", async () => {
    procedures.organizationCreate.mockResolvedValue(organization());
    renderWithQuery(<OrganizationsPage />);
    await userEvent.type(await screen.findByLabelText("Nom de l'organisation"), "Atelier{Enter}");
    await waitFor(() => expect(procedures.organizationCreate).toHaveBeenCalled());
  });

  it("envoie l'identifiant saisi dans « Personnaliser l'identifiant »", async () => {
    procedures.organizationCreate.mockResolvedValue(organization());
    renderWithQuery(<OrganizationsPage />);
    await userEvent.type(await screen.findByLabelText("Nom de l'organisation"), "Atelier");
    const toggle = screen.getByRole("button", { name: "Personnaliser l'identifiant" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Laissé vide, il est déduit du nom.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Identifiant"), "atelier-2");
    await userEvent.click(screen.getByRole("button", { name: "Créer l'organisation" }));
    await waitFor(() =>
      expect(procedures.organizationCreate.mock.calls[0]?.[0]).toEqual({
        name: "Atelier",
        slug: "atelier-2",
      }),
    );
  });

  it("pendant la création : champ en lecture seule, bouton désactivé aria-busy « Création… »", async () => {
    procedures.organizationCreate.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<OrganizationsPage />);
    await userEvent.type(await screen.findByLabelText("Nom de l'organisation"), "Atelier");
    await userEvent.click(screen.getByRole("button", { name: "Créer l'organisation" }));
    const busy = await findNamed("button", "Création…");
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Nom de l'organisation")).toHaveAttribute("readonly");
  });

  it("refuse un nom vide : erreur liée au champ, focus, aucun appel API", async () => {
    renderWithQuery(<OrganizationsPage />);
    await userEvent.click(await findNamed("button", "Créer l'organisation"));
    const field = screen.getByLabelText("Nom de l'organisation");
    expect(await screen.findByText("Saisissez le nom de l'organisation.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    const describedBy = field.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy.split(" ")[0] ?? "")).toHaveTextContent(
      "Saisissez le nom de l'organisation.",
    );
    expect(field).toHaveFocus();
    expect(procedures.organizationCreate).not.toHaveBeenCalled();
  });

  it("refuse un nom de plus de 100 caractères", async () => {
    renderWithQuery(<OrganizationsPage />);
    await userEvent.click(await screen.findByLabelText("Nom de l'organisation"));
    await userEvent.paste("a".repeat(101));
    await userEvent.click(screen.getByRole("button", { name: "Créer l'organisation" }));
    expect(
      await screen.findByText("Le nom ne peut pas dépasser 100 caractères."),
    ).toBeInTheDocument();
    expect(procedures.organizationCreate).not.toHaveBeenCalled();
  });

  it("refuse un identifiant invalide", async () => {
    renderWithQuery(<OrganizationsPage />);
    await userEvent.type(await screen.findByLabelText("Nom de l'organisation"), "Atelier");
    await userEvent.click(screen.getByRole("button", { name: "Personnaliser l'identifiant" }));
    await userEvent.type(screen.getByLabelText("Identifiant"), "A B");
    await userEvent.click(screen.getByRole("button", { name: "Créer l'organisation" }));
    expect(
      await screen.findByText("Utilisez 2 à 48 lettres minuscules, chiffres ou tirets."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Identifiant")).toHaveAttribute("aria-invalid", "true");
    expect(procedures.organizationCreate).not.toHaveBeenCalled();
  });

  it("CONFLICT slug_taken : ouvre l'identifiant, erreur sous le champ, focus", async () => {
    procedures.organizationCreate.mockImplementation(() =>
      Promise.reject(apiError("CONFLICT", { reason: "slug_taken" })),
    );
    renderWithQuery(<OrganizationsPage />);
    await userEvent.type(await screen.findByLabelText("Nom de l'organisation"), "Atelier");
    await userEvent.click(screen.getByRole("button", { name: "Créer l'organisation" }));
    expect(
      await screen.findByText("Cet identifiant est déjà utilisé. Choisissez-en un autre."),
    ).toBeInTheDocument();
    const slug = screen.getByLabelText("Identifiant");
    expect(slug).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(slug).toHaveFocus());
    expect(navigations()).not.toContain("/projects");
  });

  it("INTERNAL : Alert destructive « Impossible de continuer », saisie conservée", async () => {
    procedures.organizationCreate.mockImplementation(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<OrganizationsPage />);
    await userEvent.type(await screen.findByLabelText("Nom de l'organisation"), "Atelier");
    await userEvent.click(screen.getByRole("button", { name: "Créer l'organisation" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de continuer");
    expect(alert).toHaveTextContent(GENERIC);
    expect(screen.getByLabelText("Nom de l'organisation")).toHaveValue("Atelier");
  });
});

describe("S-organizations — 1 organisation (activation automatique)", () => {
  beforeEach(() => {
    procedures.organizationList.mockResolvedValue([organization()]);
  });

  it("annonce « Ouverture de <nom>… », active l'organisation puis navigue vers /projects", async () => {
    setActive.mockReturnValue(new Promise((done) => setTimeout(() => done({ data: {} }), 50)));
    renderWithQuery(<OrganizationsPage />);
    const opening = await screen.findByText("Ouverture de Atelier Lumière…");
    expect(opening.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByLabelText("Nom de l'organisation")).not.toBeInTheDocument();
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ organizationId: ORG_ID }));
    await waitFor(() => expect(navigations()).toContain("/projects"));
  });

  it("échec d'activation : retombe sur la liste avec l'erreur", async () => {
    setActive.mockImplementation(() => Promise.reject(new Error("boom")));
    renderWithQuery(<OrganizationsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de continuer");
    expect(
      screen.getByRole("button", { name: "Ouvrir l'organisation Atelier Lumière" }),
    ).toBeInTheDocument();
    expect(navigations()).not.toContain("/projects");
  });
});

describe("S-organizations — 2 organisations ou plus (choix)", () => {
  const orgs = [
    organization(),
    organization({ id: OTHER_ORG_ID, name: "Studio Nord", slug: "studio-nord", role: "dev" }),
  ];
  beforeEach(() => {
    procedures.organizationList.mockResolvedValue(orgs);
  });

  it("liste les organisations avec leur rôle et un bouton « Ouvrir » nommé", async () => {
    renderWithQuery(<OrganizationsPage />);
    expect(
      await findNamed("heading", "Choisir une organisation", { level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ouvrir l'organisation Atelier Lumière" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ouvrir l'organisation Studio Nord" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Propriétaire")).toBeInTheDocument();
    expect(screen.getByText("Développeur")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom de l'organisation")).toBeInTheDocument();
    expect(setActive).not.toHaveBeenCalled();
  });

  it("« Ouvrir » active l'organisation choisie puis navigue vers /projects", async () => {
    renderWithQuery(<OrganizationsPage />);
    await screen.findByText("Studio Nord");
    await userEvent.click(
      screen.getByRole("button", { name: "Ouvrir l'organisation Studio Nord" }),
    );
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ organizationId: OTHER_ORG_ID }));
    await waitFor(() => expect(navigations()).toContain("/projects"));
  });

  it("avec une organisation déjà active : pas d'activation auto, « Active » + « Retour aux projets »", async () => {
    getSession.mockResolvedValue(sessionWith(ORG_ID));
    procedures.organizationList.mockResolvedValue([organization()]);
    renderWithQuery(<OrganizationsPage />);
    const row = (await screen.findByText("Atelier Lumière")).closest("li, tr, div") as HTMLElement;
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ouvrir l'organisation Atelier Lumière" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour aux projets" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(setActive).not.toHaveBeenCalled();
  });
});

describe("S-organizations — erreur de liste", () => {
  it("INTERNAL : Alert « Impossible de continuer » et bouton « Réessayer »", async () => {
    procedures.organizationList.mockImplementationOnce(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<OrganizationsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de continuer");
    expect(alert).toHaveTextContent(GENERIC);
    procedures.organizationList.mockResolvedValue([]);
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByLabelText("Nom de l'organisation")).toBeInTheDocument();
  });

  it("UNAUTHORIZED avec session existante : jamais /login (G1)", async () => {
    procedures.organizationList.mockImplementation(() => Promise.reject(apiError("UNAUTHORIZED")));
    getSession.mockResolvedValue(sessionWith(null));
    renderWithQuery(<OrganizationsPage />);
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(navigations()).not.toContain("/login");
  });

  it("UNAUTHORIZED avec session perdue : redirige vers /login", async () => {
    procedures.organizationList.mockImplementation(() => Promise.reject(apiError("UNAUTHORIZED")));
    getSession.mockResolvedValue({ data: null, error: null });
    renderWithQuery(<OrganizationsPage />);
    await waitFor(() => expect(navigations()).toContain("/login"));
  });
});
