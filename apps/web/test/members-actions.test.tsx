import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembersPage } from "../src/components/members-page.tsx";
import { asRole, ROWS, seedMembers } from "./support/members-fixtures.ts";
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

const DEV = ROWS[1];
const OWNER = ROWS[0];

async function openMenu(name: string) {
  await userEvent.click(await screen.findByRole("button", { name: `Actions pour ${name}` }));
}

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  seedMembers();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("Membres : menu de rôle et retrait", () => {
  it("jamais de menu sur sa propre ligne", async () => {
    renderWithQuery(<MembersPage />);
    await screen.findByRole("button", { name: "Actions pour Moussa Diallo" });
    expect(screen.queryByRole("button", { name: "Actions pour Awa Koné" })).not.toBeInTheDocument();
  });

  it("tant que me.get n'a pas répondu, aucun menu (on ne sait pas qui est soi)", async () => {
    procedures.meGet.mockReturnValue(new Promise(() => undefined));
    renderWithQuery(<MembersPage />);
    await screen.findByText("Moussa Diallo");
    expect(screen.queryByRole("button", { name: /^Actions pour/ })).not.toBeInTheDocument();
  });

  it("propose les rôles sauf le rôle actuel (admin compris pour un propriétaire), puis « Retirer »", async () => {
    renderWithQuery(<MembersPage />);
    await openMenu("Moussa Diallo");
    const names = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(names).toEqual([
      "Administrateur",
      "Designer",
      "Client",
      "Business",
      "Retirer de l'organisation",
    ]);
  });

  it("administrateur : pas d'« Administrateur » dans le menu, aucun menu sur un propriétaire", async () => {
    asRole("admin");
    procedures.meGet.mockResolvedValue({ ...OWNER, id: "autre", role: "admin" });
    renderWithQuery(<MembersPage />);
    await openMenu("Moussa Diallo");
    const names = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(names).not.toContain("Administrateur");
    expect(screen.queryByRole("button", { name: "Actions pour Awa Koné" })).not.toBeInTheDocument();
  });

  it("changer le rôle : member.updateRole, annonce « Rôle de … : Designer », liste rechargée", async () => {
    procedures.memberUpdateRole.mockResolvedValue({ id: DEV?.id, role: "designer" });
    renderWithQuery(<MembersPage />);
    await openMenu("Moussa Diallo");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Designer" }));
    await waitFor(() => expect(procedures.memberUpdateRole).toHaveBeenCalled());
    expect(procedures.memberUpdateRole.mock.calls[0]?.[0]).toEqual({
      memberId: DEV?.id,
      role: "designer",
    });
    const status = await screen.findByText("Rôle de Moussa Diallo : Designer");
    expect(status.closest("[role=status]")).not.toBeNull();
    await waitFor(() => expect(procedures.memberPage.mock.calls.length).toBeGreaterThan(1));
  });

  it("échec du changement de rôle : Alert explicite", async () => {
    procedures.memberUpdateRole.mockImplementation(() => Promise.reject(apiError("INTERNAL")));
    renderWithQuery(<MembersPage />);
    await openMenu("Moussa Diallo");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Designer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Le rôle n'a pas pu être modifié");
  });

  it("retrait : confirmation nommée, focus sur « Garder », rien n'est envoyé avant « Retirer »", async () => {
    renderWithQuery(<MembersPage />);
    await openMenu("Moussa Diallo");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Retirer de l'organisation" }),
    );
    const group = await screen.findByRole("group", { name: "Confirmer le retrait" });
    expect(group).toHaveTextContent("Retirer Moussa Diallo de l'organisation ?");
    await waitFor(() =>
      expect(within(group).getByRole("button", { name: "Garder" })).toHaveFocus(),
    );
    expect(procedures.memberRemove).not.toHaveBeenCalled();
  });

  it("« Garder » ferme la confirmation sans appel", async () => {
    renderWithQuery(<MembersPage />);
    await openMenu("Moussa Diallo");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Retirer de l'organisation" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Garder" }));
    expect(screen.queryByRole("group", { name: "Confirmer le retrait" })).not.toBeInTheDocument();
    expect(procedures.memberRemove).not.toHaveBeenCalled();
  });

  it("« Retirer » : member.remove, annonce « … a été retiré. », liste rechargée", async () => {
    procedures.memberRemove.mockResolvedValue({ id: DEV?.id });
    renderWithQuery(<MembersPage />);
    await openMenu("Moussa Diallo");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Retirer de l'organisation" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Retirer" }));
    await waitFor(() => expect(procedures.memberRemove).toHaveBeenCalled());
    expect(procedures.memberRemove.mock.calls[0]?.[0]).toEqual({ memberId: DEV?.id });
    expect(await screen.findByText("Moussa Diallo a été retiré.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Confirmer le retrait" })).not.toBeInTheDocument();
  });

  it("dernier propriétaire (CONFLICT last_owner) : message dédié", async () => {
    procedures.memberRemove.mockImplementation(() =>
      Promise.reject(apiError("CONFLICT", { reason: "last_owner" })),
    );
    renderWithQuery(<MembersPage />);
    await openMenu("Moussa Diallo");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Retirer de l'organisation" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Retirer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Une organisation garde au moins un propriétaire.",
    );
  });
});
