import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commitOnSubmit, renderSecurity, SHA40, serveSecurity } from "./support/security.tsx";
import { polyfillRadix, procedures, resetWebMocks, watchUrl } from "./support/web-mocks.ts";

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return {
    useRouter: () => m.router,
    usePathname: () => m.pathname.current,
    useSearchParams: m.useSearchParams,
  };
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
  watchUrl();
});

const PROPOSAL = {
  id: "01900000-0000-7000-8000-000000000101",
  launchId: "l1",
  kind: "summary",
  zone: "Résumé client",
  position: 0,
  title: "Résumé client",
  rationale: "suite au changement de fournisseur SMS",
  content: { location: "Les SMS passent par un autre prestataire." },
  status: "pending",
  appliedBatchId: null,
  createdAt: "2026-11-27T10:00:00.000Z",
};

function serveProposal() {
  procedures.proposalList.mockImplementation(async (input: unknown) => {
    const { group } = input as { group?: string };
    return {
      items: group === "summary" ? [PROPOSAL] : [],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 0,
      groups: [],
      launch: { id: "l1", status: "done", proposedCount: 1, discardedCount: 0 },
    };
  });
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("onglet Résumé client", () => {
  it("intro, sept cartes (la dernière pleine largeur), attente et pied", async () => {
    serveSecurity("owner");
    renderSecurity({ search: "tab=summary" });
    expect(await screen.findAllByRole("article")).toHaveLength(7);
    expect(screen.getByRole("note")).toHaveTextContent("C'est ce que lit le client");
    expect(screen.getByRole("article", { name: "En cas d'incident" }).className).toContain(
      "col-span-full",
    );
    expect(screen.getByRole("region", { name: "Ce que nous attendons de vous" })).toHaveTextContent(
      "Le nom et le téléphone de la personne à prévenir",
    );
    expect(screen.getByText(/sans identifiants techniques/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Indiquer un contact" })).toBeNull();
  });

  it("« Mettre à jour avec l'agent » lance le résumé", async () => {
    serveSecurity("owner");
    procedures.securitySummaryPropose.mockResolvedValue({ launchId: "l2" });
    renderSecurity({ search: "tab=summary" });
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Mettre à jour avec l'agent" }));
    await waitFor(() => expect(procedures.securitySummaryPropose).toHaveBeenCalled());
  });

  it("proposition en pointillés : Accepter enregistre, Rejeter écarte", async () => {
    serveSecurity("owner");
    serveProposal();
    commitOnSubmit(procedures.securitySummaryAccept);
    renderSecurity({ search: "tab=summary" });
    const box = await screen.findByRole("group", { name: "Proposition de l'agent" });
    expect(box).toHaveTextContent("suite au changement de fournisseur SMS");
    expect(box).toHaveTextContent("Les SMS passent par un autre prestataire.");
    await userEvent.setup().click(within(box).getByRole("button", { name: "Accepter" }));
    await waitFor(() =>
      expect(procedures.securitySummaryAccept.mock.calls[0]?.[0]).toMatchObject({
        proposalId: PROPOSAL.id,
        baseSha: SHA40.length === 40 ? expect.any(String) : "",
      }),
    );
  });

  it("Rejeter appelle la décision commune", async () => {
    serveSecurity("owner");
    serveProposal();
    procedures.proposalDecide.mockResolvedValue({});
    renderSecurity({ search: "tab=summary" });
    const box = await screen.findByRole("group", { name: "Proposition de l'agent" });
    await userEvent.setup().click(within(box).getByRole("button", { name: "Rejeter" }));
    await waitFor(() =>
      expect(procedures.proposalDecide.mock.calls[0]?.[0]).toMatchObject({ decision: "reject" }),
    );
  });

  it("aucun résumé", async () => {
    serveSecurity("owner", { summary: false });
    renderSecurity({ search: "tab=summary" });
    expect(await screen.findByText("Aucun résumé pour l'instant")).toBeVisible();
  });
});
