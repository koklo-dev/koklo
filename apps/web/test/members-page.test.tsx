import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembersPage } from "../src/components/members-page.tsx";
import { renderWithQuery } from "./support/render.tsx";
import { findNamed } from "./support/wait.ts";
import {
  apiError,
  getSession,
  navigations,
  ORG_ID,
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

const MEMBERS = [
  {
    id: "01900000-0000-7000-8000-0000000000b1",
    userId: "01900000-0000-7000-8000-0000000000c1",
    name: "Awa Koné",
    email: "awa@example.com",
    role: "owner",
  },
  {
    id: "01900000-0000-7000-8000-0000000000b2",
    userId: "01900000-0000-7000-8000-0000000000c2",
    name: "Moussa Diallo",
    email: "moussa@example.com",
    role: "dev",
  },
];
const INVITATION = {
  id: "01900000-0000-7000-8000-0000000000d1",
  email: "nina@example.com",
  role: "designer",
  status: "pending",
  expiresAt: "2026-11-05T10:00:00.000Z",
};

function asRole(role: string) {
  getSession.mockResolvedValue(sessionWith(ORG_ID));
  procedures.organizationList.mockResolvedValue([organization({ role })]);
}

async function chooseRole(label: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "Rôle" }));
  await userEvent.click(await findNamed("option", label));
}

async function fillInvite(email: string, role: string) {
  await userEvent.type(await screen.findByLabelText("Adresse e-mail"), email);
  await chooseRole(role);
  await userEvent.click(screen.getByRole("button", { name: "Inviter" }));
}

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  procedures.memberList.mockResolvedValue(MEMBERS);
  asRole("owner");
});

describe("S-members — liste", () => {
  it("annonce le chargement des membres sans bloquer le formulaire", async () => {
    procedures.memberList.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<MembersPage />);
    const label = await screen.findByText("Chargement des membres…");
    expect(label.closest("[role=status]")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByLabelText("Adresse e-mail")).toBeInTheDocument();
  });

  it("rend un tableau « Liste des membres » avec nom, e-mail et rôle en texte", async () => {
    renderWithQuery(<MembersPage />);
    await screen.findByText("Moussa Diallo");
    expect(screen.getByRole("table", { name: "Liste des membres" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Membre" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Rôle" })).toBeInTheDocument();
    const row = screen.getByText("Moussa Diallo").closest("tr") as HTMLElement;
    expect(within(row).getByText("moussa@example.com")).toBeInTheDocument();
    expect(within(row).getByText("Développeur")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Membres" })).toBeInTheDocument();
    expect(screen.getByText("2 membres")).toBeInTheDocument();
    expect(screen.getByTestId("members-page")).toBeInTheDocument();
  });

  it("erreur de liste : Alert « Impossible de charger les membres » et « Réessayer »", async () => {
    procedures.memberList.mockImplementationOnce(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<MembersPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Impossible de charger les membres");
    expect(alert).toHaveTextContent(
      "Une erreur est survenue. Vérifiez votre connexion puis réessayez.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Moussa Diallo")).toBeInTheDocument();
  });

  it("session sans organisation active (UNAUTHORIZED) : /organizations, jamais /login", async () => {
    procedures.memberList.mockImplementation(() => Promise.reject(apiError("UNAUTHORIZED")));
    getSession.mockResolvedValue(sessionWith(null));
    renderWithQuery(<MembersPage />);
    await waitFor(() => expect(navigations()).toContain("/organizations"));
    expect(navigations()).not.toContain("/login");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même écran, un test par comportement
describe("S-members — droits selon le rôle (C2.c, C2.d)", () => {
  it("rôle client : member.list n'est pas appelé, message d'accès réservé, ni liste ni formulaire", async () => {
    asRole("client");
    renderWithQuery(<MembersPage />);
    expect(
      await screen.findByText("La liste des membres est réservée à l'équipe."),
    ).toBeInTheDocument();
    expect(procedures.memberList).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Adresse e-mail")).not.toBeInTheDocument();
  });

  it("organization.list en échec : rôle inconnu = non autorisé, aucun appel, notice équipe", async () => {
    getSession.mockResolvedValue(sessionWith(ORG_ID));
    procedures.organizationList.mockImplementation(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<MembersPage />);
    expect(
      await screen.findByText("La liste des membres est réservée à l'équipe."),
    ).toBeInTheDocument();
    expect(procedures.memberList).not.toHaveBeenCalled();
    expect(screen.queryByText("Impossible de charger les membres")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Adresse e-mail")).not.toBeInTheDocument();
  });

  it("organisation active absente de la liste (rôle inconnu) : aucun appel, notice équipe", async () => {
    getSession.mockResolvedValue(sessionWith("01900000-0000-7000-8000-00000000ffff"));
    renderWithQuery(<MembersPage />);
    expect(
      await screen.findByText("La liste des membres est réservée à l'équipe."),
    ).toBeInTheDocument();
    expect(procedures.memberList).not.toHaveBeenCalled();
  });

  it("rôle inconnu de l'API (hors liste fermée) : aucun appel", async () => {
    asRole("inconnu");
    renderWithQuery(<MembersPage />);
    expect(
      await screen.findByText("La liste des membres est réservée à l'équipe."),
    ).toBeInTheDocument();
    expect(procedures.memberList).not.toHaveBeenCalled();
  });

  it.each(["dev", "designer", "business"])(
    "rôle %s : pas de formulaire, message « droits insuffisants », liste visible",
    async (role) => {
      asRole(role);
      renderWithQuery(<MembersPage />);
      expect(
        await screen.findByText(
          "Seuls les propriétaires et les administrateurs peuvent inviter des membres.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("Adresse e-mail")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Inviter" })).not.toBeInTheDocument();
      await screen.findByText("Moussa Diallo");
      expect(screen.getByRole("table", { name: "Liste des membres" })).toBeInTheDocument();
    },
  );

  it("propriétaire : propose admin, dev, designer, client, business, jamais owner", async () => {
    renderWithQuery(<MembersPage />);
    await screen.findByLabelText("Adresse e-mail");
    await userEvent.click(screen.getByRole("combobox", { name: "Rôle" }));
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names).toEqual(["Administrateur", "Développeur", "Designer", "Client", "Business"]);
  });

  it("administrateur : n'a pas « Administrateur » dans le sélecteur", async () => {
    asRole("admin");
    renderWithQuery(<MembersPage />);
    await screen.findByLabelText("Adresse e-mail");
    await userEvent.click(screen.getByRole("combobox", { name: "Rôle" }));
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names).toEqual(["Développeur", "Designer", "Client", "Business"]);
  });

  it("aucun rôle présélectionné : placeholder « Choisir un rôle »", async () => {
    renderWithQuery(<MembersPage />);
    await screen.findByLabelText("Adresse e-mail");
    expect(screen.getByRole("combobox", { name: "Rôle" })).toHaveTextContent("Choisir un rôle");
  });
});

describe("S-members — invitation (C2.a)", () => {
  it("appelle member.invite avec l'e-mail et le rôle choisis", async () => {
    procedures.memberInvite.mockResolvedValue(INVITATION);
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    await waitFor(() => expect(procedures.memberInvite).toHaveBeenCalled());
    expect(procedures.memberInvite.mock.calls[0]?.[0]).toEqual({
      email: "nina@example.com",
      role: "designer",
    });
  });

  it("succès : « Invitation créée » persistant (role=status), jamais « e-mail envoyé », formulaire vidé, focus sur l'e-mail", async () => {
    procedures.memberInvite.mockResolvedValue(INVITATION);
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    const status = await screen.findByText("Invitation créée");
    const box = status.closest("[role=status]") as HTMLElement;
    expect(box).not.toBeNull();
    expect(box).toHaveTextContent("nina@example.com est invité comme Designer jusqu'au");
    expect(box).toHaveTextContent("5 novembre 2026");
    expect(box).toHaveTextContent("L'e-mail part en arrière-plan.");
    expect(box.textContent).not.toMatch(/e-mail envoyé/i);
    const email = screen.getByLabelText("Adresse e-mail");
    expect(email).toHaveValue("");
    await waitFor(() => expect(email).toHaveFocus());
  });

  it("le message de succès disparaît à la prochaine saisie", async () => {
    procedures.memberInvite.mockResolvedValue(INVITATION);
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    await screen.findByText("Invitation créée");
    await userEvent.type(screen.getByLabelText("Adresse e-mail"), "a");
    expect(screen.queryByText("Invitation créée")).not.toBeInTheDocument();
  });

  it("pendant l'envoi : bouton désactivé aria-busy « Invitation… », champ en lecture seule", async () => {
    procedures.memberInvite.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    const busy = await findNamed("button", "Invitation…");
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Adresse e-mail")).toHaveAttribute("readonly");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("S-members — erreurs d'invitation (C2.b)", () => {
  it("e-mail invalide : erreur liée au champ, focus, aucun appel API", async () => {
    renderWithQuery(<MembersPage />);
    await fillInvite("pas-un-email", "Designer");
    expect(
      await screen.findByText("Saisissez une adresse e-mail valide, par exemple nom@exemple.fr."),
    ).toBeInTheDocument();
    const email = screen.getByLabelText("Adresse e-mail");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby");
    expect(email).toHaveFocus();
    expect(procedures.memberInvite).not.toHaveBeenCalled();
  });

  it("rôle manquant : « Choisissez un rôle. »", async () => {
    renderWithQuery(<MembersPage />);
    await userEvent.type(await screen.findByLabelText("Adresse e-mail"), "nina@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Inviter" }));
    expect(await screen.findByText("Choisissez un rôle.")).toBeInTheDocument();
    expect(procedures.memberInvite).not.toHaveBeenCalled();
  });

  it("CONFLICT already_member : message dédié sous le champ e-mail", async () => {
    procedures.memberInvite.mockImplementation(() =>
      Promise.reject(apiError("CONFLICT", { reason: "already_member" })),
    );
    renderWithQuery(<MembersPage />);
    await fillInvite("moussa@example.com", "Développeur");
    expect(
      await screen.findByText("Cette personne fait déjà partie de l'organisation."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Adresse e-mail")).toHaveAttribute("aria-invalid", "true");
  });

  it("CONFLICT already_invited : message distinct", async () => {
    procedures.memberInvite.mockImplementation(() =>
      Promise.reject(apiError("CONFLICT", { reason: "already_invited" })),
    );
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    expect(
      await screen.findByText("Cette personne a déjà une invitation en attente."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Cette personne fait déjà partie de l'organisation."),
    ).not.toBeInTheDocument();
  });

  it("FORBIDDEN : Alert destructive avec explication du droit manquant", async () => {
    procedures.memberInvite.mockImplementation(() => Promise.reject(apiError("FORBIDDEN")));
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vous n'avez pas le droit d'inviter ce rôle. Seul un propriétaire peut inviter un administrateur.",
    );
  });

  it("INTERNAL : Alert « L'invitation n'a pas pu être créée », saisie conservée", async () => {
    procedures.memberInvite.mockImplementation(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<MembersPage />);
    await fillInvite("nina@example.com", "Designer");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("L'invitation n'a pas pu être créée");
    expect(alert).toHaveTextContent("Une erreur est survenue. Réessayez dans un instant.");
    expect(screen.getByLabelText("Adresse e-mail")).toHaveValue("nina@example.com");
  });
});
