import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembersPage } from "../src/components/members-page.tsx";
import { PENDING, seedMembers } from "./support/members-fixtures.ts";
import { renderWithQuery } from "./support/render.tsx";
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

const NINA = PENDING[0];

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  seedMembers();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("Invitations en attente", () => {
  it("liste e-mail, rôle, qui invite, expiration et projets, avec le nombre dans le titre", async () => {
    renderWithQuery(<MembersPage />);
    expect(
      await screen.findByRole("heading", { level: 3, name: "Invitations en attente · 2" }),
    ).toBeInTheDocument();
    const nina = (await screen.findByText("nina@example.com")).closest("li") as HTMLElement;
    expect(within(nina).getByText("Designer")).toBeInTheDocument();
    expect(nina).toHaveTextContent("Invitée par Awa Koné");
    expect(nina).toHaveTextContent("expire le 11 nov. 2026");
    const karim = screen.getByText("karim@example.com").closest("li") as HTMLElement;
    expect(karim).toHaveTextContent("Portail de réservation");
  });

  it("vide : « Aucune invitation en attente. »", async () => {
    procedures.invitationList.mockResolvedValue([]);
    renderWithQuery(<MembersPage />);
    expect(await screen.findByText("Aucune invitation en attente.")).toBeInTheDocument();
  });

  it("erreur : Alert « Impossible de charger les invitations » et « Réessayer »", async () => {
    procedures.invitationList.mockImplementationOnce(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<MembersPage />);
    const alert = await screen.findByText("Impossible de charger les invitations");
    expect(alert.closest("[role=alert]")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("nina@example.com")).toBeInTheDocument();
  });

  it("Renvoyer : invitation.resend puis annonce", async () => {
    procedures.invitationResend.mockResolvedValue(NINA);
    renderWithQuery(<MembersPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Renvoyer l'invitation à nina@example.com" }),
    );
    await waitFor(() => expect(procedures.invitationResend).toHaveBeenCalled());
    expect(procedures.invitationResend.mock.calls[0]?.[0]).toEqual({ invitationId: NINA?.id });
    const status = await screen.findByText("Invitation renvoyée à nina@example.com.");
    expect(status.closest("[role=status]")).not.toBeNull();
  });

  it("Annuler : invitation.revoke, annonce, liste rechargée", async () => {
    procedures.invitationRevoke.mockResolvedValue({ id: NINA?.id });
    renderWithQuery(<MembersPage />);
    await screen.findByText("nina@example.com");
    const before = procedures.invitationList.mock.calls.length;
    await userEvent.click(
      screen.getByRole("button", { name: "Annuler l'invitation à nina@example.com" }),
    );
    await waitFor(() => expect(procedures.invitationRevoke).toHaveBeenCalled());
    expect(procedures.invitationRevoke.mock.calls[0]?.[0]).toEqual({ invitationId: NINA?.id });
    expect(await screen.findByText("Invitation à nina@example.com annulée.")).toBeInTheDocument();
    await waitFor(() =>
      expect(procedures.invitationList.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("échec du renvoi : Alert explicite", async () => {
    procedures.invitationResend.mockImplementation(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<MembersPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Renvoyer l'invitation à nina@example.com" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("L'action n'a pas pu aboutir");
  });
});
