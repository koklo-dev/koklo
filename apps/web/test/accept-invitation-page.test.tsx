import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AcceptInvitationRoute, {
  metadata as acceptInvitationMetadata,
} from "../src/app/accept-invitation/[id]/page.tsx";
import { AcceptInvitationPage } from "../src/components/accept-invitation-page.tsx";
import { renderWithQuery } from "./support/render.tsx";
import {
  acceptInvitation,
  getInvitation,
  getSession,
  listOrganizations,
  navigations,
  ORG_ID,
  organization,
  polyfillRadix,
  resetWebMocks,
  router,
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

const INVITATION_ID = "01900000-0000-7000-8000-0000000000b1";
const SESSION_EMAIL = "awa@example.com";
const INVITED_EMAIL = "invite@example.com";

/** Forme des erreurs du client Better Auth : `{ data: null, error: { status, code, message } }`. */
const failure = (status: number, code: string, message = code) => ({
  data: null,
  error: { status, code, message },
});
const NOT_FOUND = failure(400, "INVITATION_NOT_FOUND", "Invitation not found!");
const WRONG_RECIPIENT = failure(
  403,
  "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
  "You are not the recipient of the invitation",
);
const SERVER_ERROR = failure(500, "INTERNAL_SERVER_ERROR", "Internal Server Error");

const invitation = (over: Record<string, unknown> = {}) => ({
  data: {
    id: INVITATION_ID,
    email: SESSION_EMAIL,
    role: "dev",
    status: "pending",
    organizationId: ORG_ID,
    organizationName: "Atelier Lumière",
    organizationSlug: "atelier-lumiere",
    inviterEmail: "chef@example.com",
    ...over,
  },
  error: null,
});

const GENERIC = "Une erreur est survenue. Vérifiez votre connexion puis réessayez.";
const mount = (id = INVITATION_ID) => renderWithQuery(<AcceptInvitationPage invitationId={id} />);
const heading = () => screen.findByRole("heading", { level: 1 });

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  getSession.mockResolvedValue(sessionWith(null));
  getInvitation.mockResolvedValue(invitation());
  acceptInvitation.mockResolvedValue({ data: { member: { id: "m1" } }, error: null });
  listOrganizations.mockResolvedValue({ data: [], error: null });
  signOut.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("C1.e : état prêt et acceptation", () => {
  it("affiche l'aperçu (organisation, inviteur, rôle) puis un seul bouton principal", async () => {
    mount();
    const title = await screen.findByRole("heading", {
      level: 1,
      name: "Rejoindre Atelier Lumière",
    });
    const page = screen.getByTestId("accept-invitation-page");
    expect(within(page).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(page).toHaveTextContent("chef@example.com vous invite à rejoindre cette organisation");
    expect(page).toHaveTextContent("Développeur");
    expect(screen.getByRole("button", { name: "Accepter l'invitation" })).toBeEnabled();
    expect(page).toHaveTextContent(`Connecté en tant que ${SESSION_EMAIL}`);
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeInTheDocument();
    expect(title).toHaveFocus();
  });

  it("n'accepte pas automatiquement au chargement", async () => {
    mount();
    await heading();
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("le clic appelle acceptInvitation avec l'id de la route, invalide les requêtes et mène à /projects", async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Accepter l'invitation" }));
    await waitFor(() => expect(navigations()).toContain("/projects"));
    expect(acceptInvitation).toHaveBeenCalledTimes(1);
    expect(acceptInvitation).toHaveBeenCalledWith({ invitationId: INVITATION_ID });
    expect(invalidate).toHaveBeenCalled();
    expect(navigations()).not.toContain("/organizations");
  });

  it("pendant l'appel : bouton désactivé, aria-busy et libellé « Acceptation… »", async () => {
    acceptInvitation.mockReturnValue(new Promise(() => undefined));
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Accepter l'invitation" }));
    const busy = await screen.findByRole("button", { name: "Acceptation…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(acceptInvitation).toHaveBeenCalledTimes(1);
  });

  it("succès : état « Bienvenue dans … » annoncé en role=status", async () => {
    let finish: (value: unknown) => void = () => undefined;
    router.replace.mockImplementation(() => undefined);
    acceptInvitation.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Accepter l'invitation" }));
    finish({ data: { member: { id: "m1" } }, error: null });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Bienvenue dans Atelier Lumière" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ouverture de vos projets…");
  });
});

describe("chargement et sans session (C4.c)", () => {
  it("chargement : role=status aria-busy, aucun nom d'organisation avant la réponse", () => {
    getSession.mockReturnValue(new Promise(() => undefined));
    mount();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Chargement de l'invitation…");
    expect(screen.queryByText(/Atelier Lumière/)).not.toBeInTheDocument();
    expect(getInvitation).not.toHaveBeenCalled();
  });

  it("sans session : getInvitation n'est jamais appelé et rien de l'invitation n'est rendu", async () => {
    getSession.mockResolvedValue({ data: null, error: null });
    mount();
    await waitFor(() => expect(navigations().length).toBeGreaterThan(0));
    expect(navigations()[0]).toMatch(/^\/login/);
    expect(getInvitation).not.toHaveBeenCalled();
    expect(screen.queryByText(/Atelier Lumière|Développeur|chef@example\.com/)).toBeNull();
  });

  it("n'appelle getInvitation qu'avec l'id de la route", async () => {
    mount();
    await heading();
    expect(getInvitation).toHaveBeenCalledWith({ query: { id: INVITATION_ID } });
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("C2 : cas d'erreur (jamais de page vide)", () => {
  const INVALID = "Cette invitation n'est plus valide";

  it.each(["à l'aperçu", "à l'acceptation"])(
    "C2.a introuvable, expirée, annulée ou acceptée (%s) : message unique et issue de secours",
    async (when) => {
      if (when === "à l'aperçu") getInvitation.mockResolvedValue(NOT_FOUND);
      else acceptInvitation.mockResolvedValue(NOT_FOUND);
      mount();
      if (when === "à l'acceptation") {
        await userEvent.click(await screen.findByRole("button", { name: "Accepter l'invitation" }));
      }
      expect(await screen.findByRole("heading", { level: 1, name: INVALID })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        /expiré.*7 jours.*annulée.*déjà été acceptée.*nouveau lien/s,
      );
      expect(screen.getByRole("link", { name: "Aller à mes projets" })).toHaveAttribute(
        "href",
        "/projects",
      );
      expect(screen.getByTestId("accept-invitation-page")).not.toBeEmptyDOMElement();
    },
  );

  it("C2.b id non-UUID : même écran, aucun appel réseau", async () => {
    mount("abc");
    expect(await heading()).toHaveTextContent(INVALID);
    expect(getInvitation).not.toHaveBeenCalled();
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("C2.c adresse différente : affiche l'adresse de session, jamais l'invitée ni l'organisation (C4.b)", async () => {
    getInvitation.mockResolvedValue(WRONG_RECIPIENT);
    mount();
    expect(await heading()).toHaveTextContent("Cette invitation est destinée à une autre adresse");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(`Vous êtes connecté(e) avec ${SESSION_EMAIL}`);
    const page = screen.getByTestId("accept-invitation-page");
    expect(page).not.toHaveTextContent(INVITED_EMAIL);
    expect(page).not.toHaveTextContent("Atelier Lumière");
    expect(screen.queryByRole("button", { name: "Accepter l'invitation" })).toBeNull();
    expect(screen.getByRole("link", { name: "Aller à mes projets" })).toBeInTheDocument();
  });

  it("C2.c « Se déconnecter » déconnecte (retour sur l'invitation ensuite)", async () => {
    getInvitation.mockResolvedValue(WRONG_RECIPIENT);
    mount();
    await heading();
    await userEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("C2.c même 403 à l'acceptation : même écran", async () => {
    acceptInvitation.mockResolvedValue(WRONG_RECIPIENT);
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Accepter l'invitation" }));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Cette invitation est destinée à une autre adresse",
      }),
    ).toBeInTheDocument();
  });

  it("C2.d déjà membre (l'organisation figure dans organization.list) : information, pas une erreur", async () => {
    listOrganizations.mockResolvedValue({ data: [organization()], error: null });
    mount();
    expect(await heading()).toHaveTextContent("Vous faites déjà partie de cette organisation");
    expect(screen.getByTestId("accept-invitation-page")).toHaveTextContent(
      "Il n'y a rien à accepter.",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Accepter l'invitation" })).toBeNull();
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("C2.d « Ouvrir mes projets » active l'organisation puis ouvre /projects", async () => {
    listOrganizations.mockResolvedValue({ data: [organization()], error: null });
    mount();
    await heading();
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir mes projets" }));
    await waitFor(() => expect(navigations()).toContain("/projects"));
    expect(setActive).toHaveBeenCalledWith({ organizationId: ORG_ID });
  });

  it("C2.d échec à l'acceptation alors que l'organisation figure alors dans organization.list : « déjà membre »", async () => {
    // Comportement réel de Better Auth 1.7.14 : aucun contrôle de doublon, la contrainte unique
    // (organisation, utilisateur) lève une 500 et l'invitation reste `pending` (voir 03-red.md).
    acceptInvitation.mockResolvedValue(SERVER_ERROR);
    mount();
    const accept = await screen.findByRole("button", { name: "Accepter l'invitation" });
    listOrganizations.mockResolvedValue({ data: [organization()], error: null });
    await userEvent.click(accept);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Vous faites déjà partie de cette organisation",
      }),
    ).toBeInTheDocument();
  });

  it.each([
    ["réponse 5xx", () => SERVER_ERROR, "resolve"],
    ["rejet réseau", () => new TypeError("Failed to fetch"), "reject"],
  ] as const)(
    "C2.e erreur technique à l'aperçu (%s) : alerte distincte et « Réessayer »",
    async (_l, make, mode) => {
      if (mode === "resolve") getInvitation.mockResolvedValueOnce(make());
      else getInvitation.mockRejectedValueOnce(make());
      mount();
      expect(await heading()).toHaveTextContent("Impossible de continuer");
      expect(screen.getByRole("alert")).toHaveTextContent(GENERIC);
      await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
      expect(
        await screen.findByRole("heading", { level: 1, name: "Rejoindre Atelier Lumière" }),
      ).toBeInTheDocument();
      expect(getInvitation).toHaveBeenCalledTimes(2);
    },
  );

  it("C2.e erreur à l'acceptation : l'écran « prêt » reste sous l'alerte, « Réessayer » relance l'acceptation", async () => {
    acceptInvitation.mockResolvedValueOnce(SERVER_ERROR);
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Accepter l'invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(navigations()).toContain("/projects"));
  });
});

describe("C7 : focus, structure et accessibilité des états", () => {
  it.each([
    ["invalide", () => getInvitation.mockResolvedValue(NOT_FOUND), /n'est plus valide/],
    ["autre adresse", () => getInvitation.mockResolvedValue(WRONG_RECIPIENT), /autre adresse/],
    ["erreur technique", () => getInvitation.mockResolvedValue(SERVER_ERROR), /Impossible/],
  ])(
    "état %s : un seul h1 qui reçoit le focus, erreur en role=alert, icône + texte",
    async (_l, arrange, title) => {
      arrange();
      const { container } = mount();
      const h1 = await heading();
      expect(h1).toHaveTextContent(title);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(h1).toHaveFocus();
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    },
  );

  it("le focus revient sur le h1 à chaque changement d'état (prêt -> erreur)", async () => {
    acceptInvitation.mockResolvedValue(NOT_FOUND);
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Accepter l'invitation" }));
    const h1 = await screen.findByRole("heading", { level: 1, name: /n'est plus valide/ });
    await waitFor(() => expect(h1).toHaveFocus());
  });

  it("aucun lien sortant : seuls des liens internes", async () => {
    getInvitation.mockResolvedValue(NOT_FOUND);
    mount();
    await heading();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^\/(?!\/)/);
    }
  });
});

describe("C4.d : aucune fuite de l'id dans les journaux, le titre ou le texte", () => {
  it.each(["log", "info", "warn", "error", "debug"] as const)(
    "console.%s ne reçoit jamais l'id d'invitation (succès, erreurs)",
    async (method) => {
      const spy = vi.spyOn(console, method).mockImplementation(() => undefined);
      acceptInvitation.mockResolvedValueOnce(SERVER_ERROR);
      mount();
      await userEvent.click(await screen.findByRole("button", { name: "Accepter l'invitation" }));
      await screen.findByRole("alert");
      expect(JSON.stringify(spy.mock.calls)).not.toContain(INVITATION_ID);
    },
  );

  it("ni le texte de la page ni document.title ne contiennent l'id", async () => {
    getInvitation.mockResolvedValue(NOT_FOUND);
    mount();
    await heading();
    expect(screen.getByTestId("accept-invitation-page")).not.toHaveTextContent(INVITATION_ID);
    expect(document.title).not.toContain(INVITATION_ID);
  });
});

describe("route /accept-invitation/[id] (C4.e)", () => {
  it("métadonnées : titre fixe « Invitation – Koklo » et noindex", () => {
    expect(acceptInvitationMetadata.title).toBe("Invitation – Koklo");
    expect(acceptInvitationMetadata.robots).toMatchObject({ index: false });
  });

  it("compose AcceptInvitationPage avec l'id de la route", async () => {
    const element = await AcceptInvitationRoute({
      params: Promise.resolve({ id: INVITATION_ID }),
    });
    renderWithQuery(element);
    await heading();
    expect(getInvitation).toHaveBeenCalledWith({ query: { id: INVITATION_ID } });
  });
});
