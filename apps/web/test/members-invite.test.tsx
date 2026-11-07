import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembersPage } from "../src/components/members-page.tsx";
import { asRole, P1, P2, seedMembers } from "./support/members-fixtures.ts";
import { renderWithQuery } from "./support/render.tsx";
import { findNamed } from "./support/wait.ts";
import { apiError, polyfillRadix, procedures, resetWebMocks } from "./support/web-mocks.ts";

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

const CREATED = {
  id: "01900000-0000-7000-8000-0000000000d9",
  email: "nina@example.com",
  role: "designer",
  status: "pending",
  expiresAt: "2026-11-14T10:00:00.000Z",
  invitedBy: "Awa Koné",
  projects: [],
};

async function chooseRole(label: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "Rôle" }));
  await userEvent.click(await findNamed("option", label));
}

async function fillInvite(email: string, role: string) {
  await userEvent.type(await screen.findByLabelText("Adresse e-mail"), email);
  await chooseRole(role);
}

const submit = () => userEvent.click(screen.getByRole("button", { name: "Inviter" }));

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  seedMembers();
});

describe("Invitation : rôles proposés", () => {
  it("propriétaire : admin, dev, designer, client, business, jamais owner", async () => {
    renderWithQuery(<MembersPage />);
    await screen.findByLabelText("Adresse e-mail");
    await userEvent.click(screen.getByRole("combobox", { name: "Rôle" }));
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names).toEqual(["Administrateur", "Développeur", "Designer", "Client", "Business"]);
  });

  it("administrateur : pas d'« Administrateur »", async () => {
    asRole("admin");
    renderWithQuery(<MembersPage />);
    await screen.findByLabelText("Adresse e-mail");
    await userEvent.click(screen.getByRole("combobox", { name: "Rôle" }));
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names).toEqual(["Développeur", "Designer", "Client", "Business"]);
  });

  it("aucun rôle présélectionné, phrase sur l'expiration et la connexion", async () => {
    renderWithQuery(<MembersPage />);
    await screen.findByLabelText("Adresse e-mail");
    expect(screen.getByRole("combobox", { name: "Rôle" })).toHaveTextContent("Choisir un rôle");
    expect(
      screen.getByText(
        "Un client ne voit que les projets choisis ici. L'invitation expire après 7 jours ; la personne se connecte avec GitHub ou par lien magique.",
      ),
    ).toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("Invitation : projets", () => {
  it("rôle sans projet (designer) : pas de liste de projets, projectIds absent de l'appel", async () => {
    procedures.invitationCreate.mockResolvedValue(CREATED);
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    expect(screen.queryByRole("group", { name: "Projets" })).not.toBeInTheDocument();
    await submit();
    await waitFor(() => expect(procedures.invitationCreate).toHaveBeenCalled());
    expect(procedures.invitationCreate.mock.calls[0]?.[0]).toEqual({
      email: "nina@example.com",
      role: "designer",
    });
  });

  it.each(["Client", "Business"])(
    "rôle %s : liste de projets en cases à cocher, obligatoire",
    async (label) => {
      renderWithQuery(<MembersPage />);
      await fillInvite("nadia@example.com", label);
      const group = await screen.findByRole("group", { name: "Projets" });
      expect(group).toBeInTheDocument();
      expect(await screen.findByRole("checkbox", { name: P1.name })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: P2.name })).toBeInTheDocument();
      await submit();
      expect(await screen.findByText("Choisissez au moins un projet.")).toBeInTheDocument();
      expect(procedures.invitationCreate).not.toHaveBeenCalled();
    },
  );

  it("envoie les projets cochés", async () => {
    procedures.invitationCreate.mockResolvedValue({ ...CREATED, role: "client", projects: [P1] });
    renderWithQuery(<MembersPage />);
    await fillInvite("nadia@example.com", "Client");
    await userEvent.click(await screen.findByRole("checkbox", { name: P1.name }));
    await submit();
    await waitFor(() => expect(procedures.invitationCreate).toHaveBeenCalled());
    expect(procedures.invitationCreate.mock.calls[0]?.[0]).toEqual({
      email: "nadia@example.com",
      role: "client",
      projectIds: [P1.id],
    });
  });

  it("filtre la liste de projets par nom", async () => {
    renderWithQuery(<MembersPage />);
    await fillInvite("nadia@example.com", "Client");
    await userEvent.type(await screen.findByLabelText("Filtrer les projets"), "vitrine");
    expect(screen.queryByRole("checkbox", { name: P1.name })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: P2.name })).toBeInTheDocument();
  });

  it("organisation sans projet : explication à la place de la liste", async () => {
    procedures.projectList.mockResolvedValue([]);
    renderWithQuery(<MembersPage />);
    await fillInvite("nadia@example.com", "Client");
    expect(
      await screen.findByText("Aucun projet : créez-en un avant d'inviter un client."),
    ).toBeInTheDocument();
  });
});

describe("Invitation : envoi", () => {
  it("succès : « Invitation créée » persistant (role=status), jamais « e-mail envoyé », formulaire vidé, focus sur l'e-mail", async () => {
    procedures.invitationCreate.mockResolvedValue(CREATED);
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    await submit();
    const status = await screen.findByText("Invitation créée");
    const box = status.closest("[role=status]") as HTMLElement;
    expect(box).toHaveTextContent("nina@example.com est invité comme Designer jusqu'au");
    expect(box).toHaveTextContent("14 novembre 2026");
    expect(box).toHaveTextContent("L'e-mail part en arrière-plan.");
    expect(box.textContent).not.toMatch(/e-mail envoyé/i);
    const email = screen.getByLabelText("Adresse e-mail");
    expect(email).toHaveValue("");
    await waitFor(() => expect(email).toHaveFocus());
  });

  it("recharge les invitations en attente après la création", async () => {
    procedures.invitationCreate.mockResolvedValue(CREATED);
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    await screen.findByText("Invitations en attente · 2");
    const before = procedures.invitationList.mock.calls.length;
    await submit();
    await waitFor(() =>
      expect(procedures.invitationList.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("pendant l'envoi : bouton désactivé aria-busy « Invitation… », champ en lecture seule", async () => {
    procedures.invitationCreate.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    await submit();
    const busy = await findNamed("button", "Invitation…");
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Adresse e-mail")).toHaveAttribute("readonly");
  });
});

describe("Invitation : erreurs", () => {
  it("e-mail invalide : erreur liée au champ, focus, aucun appel", async () => {
    renderWithQuery(<MembersPage />);
    await fillInvite("pas-un-email", "Designer");
    await submit();
    expect(
      await screen.findByText("Saisissez une adresse e-mail valide, par exemple nom@exemple.fr."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Adresse e-mail")).toHaveFocus();
    expect(procedures.invitationCreate).not.toHaveBeenCalled();
  });

  it("rôle manquant : « Choisissez un rôle. »", async () => {
    renderWithQuery(<MembersPage />);
    await userEvent.type(await screen.findByLabelText("Adresse e-mail"), "nina@example.com");
    await submit();
    expect(await screen.findByText("Choisissez un rôle.")).toBeInTheDocument();
    expect(procedures.invitationCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["already_member", "Cette personne fait déjà partie de l'organisation."],
    ["already_invited", "Cette personne a déjà une invitation en attente."],
  ])("CONFLICT %s : message dédié sous le champ e-mail", async (reason, message) => {
    procedures.invitationCreate.mockImplementation(() =>
      Promise.reject(apiError("CONFLICT", { reason })),
    );
    renderWithQuery(<MembersPage />);
    await fillInvite("moussa@example.com", "Développeur");
    await submit();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText("Adresse e-mail")).toHaveAttribute("aria-invalid", "true");
  });

  it("FORBIDDEN : Alert avec explication du droit manquant", async () => {
    procedures.invitationCreate.mockImplementation(() => Promise.reject(apiError("FORBIDDEN")));
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vous n'avez pas le droit d'inviter ce rôle. Seul un propriétaire peut inviter un administrateur.",
    );
  });

  it("INTERNAL : Alert « L'invitation n'a pas pu être créée », saisie conservée", async () => {
    procedures.invitationCreate.mockImplementation(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "L'invitation n'a pas pu être créée",
    );
    expect(screen.getByLabelText("Adresse e-mail")).toHaveValue("nina@example.com");
  });
});
