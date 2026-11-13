import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataCommentsSection } from "../src/components/data-comments-section.tsx";
import { PROJECT_ID } from "./support/data.tsx";
import { procedures, resetWebMocks } from "./support/web-mocks.ts";

vi.mock("../src/lib/orpc.ts", async () => ({
  orpc: (await import("./support/web-mocks.ts")).orpc,
}));

/** TK-109 lot B, critère 5 : commentaires du client sur une table, lus dans la fiche par l'équipe (B448, B456). */
beforeEach(() => resetWebMocks());

const comment = (n: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-00000000c00${n}`,
  targetKind: "table",
  targetId: PROJECT_ID,
  targetRef: "T-client",
  authorKind: "client",
  authorId: "user-client",
  body: `Il manque le numéro de carte fidélité (${n}).`,
  createdAt: `2026-11-1${n}T09:30:00.000Z`,
  ...over,
});
const renderSection = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DataCommentsSection projectId={PROJECT_ID} tableId="T-client" />
    </QueryClientProvider>,
  );

describe("DataCommentsSection", () => {
  it("lit les commentaires de la table : cible table + T-slug, un élément par commentaire, auteur et date", async () => {
    procedures.commentList.mockResolvedValue({ items: [comment(1), comment(2)], nextCursor: null });
    renderSection();
    const section = await screen.findByRole("region", { name: "Commentaires du client" });
    expect(procedures.commentList.mock.calls[0]?.[0]).toMatchObject({
      projectId: PROJECT_ID,
      targetKind: "table",
      targetRef: "T-client",
    });
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Il manque le numéro de carte fidélité (1).");
    expect(items[0]).toHaveTextContent("Client");
    expect(items[0]).toHaveTextContent("11 nov.");
  });

  it("un commentaire de l'équipe porte « Équipe »", async () => {
    procedures.commentList.mockResolvedValue({
      items: [comment(1, { authorKind: "human" })],
      nextCursor: null,
    });
    renderSection();
    expect(await screen.findByText(/^Équipe · /)).toBeInTheDocument();
  });

  it("aucun commentaire : rien n'est affiché", async () => {
    procedures.commentList.mockResolvedValue({ items: [], nextCursor: null });
    const { container } = renderSection();
    await vi.waitFor(() => expect(procedures.commentList).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("échec : phrase en français et « Réessayer » qui relit", async () => {
    procedures.commentList.mockRejectedValueOnce(new Error("boom"));
    procedures.commentList.mockResolvedValue({ items: [comment(1)], nextCursor: null });
    renderSection();
    expect(await screen.findByText(/commentaires n'ont pas pu être chargés/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText(/Il manque le numéro de carte/)).toBeInTheDocument();
  });
});
