import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdeaEditor } from "../src/components/idea-editor.tsx";
import { IdeaProposals } from "../src/components/idea-proposals.tsx";
import { useIdeaProposals } from "../src/lib/use-idea-proposals.ts";
import { agentMocks, PAGE_ID, PROJECT, page, proposal } from "./support/idea-agent.tsx";

vi.mock("../src/lib/orpc.ts", async () => (await import("./support/idea-agent.tsx")).fakeOrpc());

const PAGE = {
  ...page(),
  contentMd: "Premier bloc.\n\nSecond bloc.\n\nTroisième bloc.\n",
} as never;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function Space({ proposals, stale = false }: { proposals: unknown[]; stale?: boolean }) {
  const askAgain = vi.fn();
  const decisions = useIdeaProposals(PROJECT);
  return (
    <IdeaProposals
      proposals={proposals as never}
      page={PAGE}
      decisions={decisions}
      stale={stale}
      onAskAgain={askAgain}
    >
      {(slots, renderSlot) => (
        <IdeaEditor
          page={PAGE}
          editable
          replacement={null}
          onChange={() => undefined}
          onBlur={() => undefined}
          slots={slots}
          renderSlot={renderSlot}
        />
      )}
    </IdeaProposals>
  );
}

beforeEach(() => {
  for (const mock of Object.values(agentMocks)) mock.mockReset();
  agentMocks.list.mockResolvedValue({});
  agentMocks.getPage.mockResolvedValue({});
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Propositions sur place (TK-90)", () => {
  it("la proposition s'insère sous le bloc d'ancre, pas ailleurs", async () => {
    render(<Space proposals={[proposal({ anchorBlockIndex: 1 })]} />, { wrapper });
    const region = await screen.findByRole("region", { name: "Proposition de l'agent" });
    const editor = document.querySelector(".ProseMirror") as HTMLElement;
    const kids = [...editor.children];
    const at = kids.findIndex((el) => el.contains(region));
    expect(kids[at - 1]?.textContent).toBe("Second bloc.");
    expect(kids[at + 1]?.textContent).toBe("Troisième bloc.");
  });

  it("append : à la fin de la page", async () => {
    render(<Space proposals={[proposal({ op: "append", anchorBlockIndex: null })]} />, { wrapper });
    const region = await screen.findByRole("region", { name: "Proposition de l'agent" });
    const editor = document.querySelector(".ProseMirror") as HTMLElement;
    expect(editor.lastElementChild?.contains(region) || editor.contains(region)).toBe(true);
    expect(
      [...editor.children].at(-1)?.contains(region) ||
        [...editor.children].at(-2)?.contains(region),
    ).toBe(true);
  });

  it("contenu hostile : texte littéral, aucun lien actif ; Modifier n'en active aucun avant Accepter", async () => {
    const hostile = proposal({
      contentMd: "[x](http://evil.example) <img src=x onerror=alert(1)>",
    });
    render(<Space proposals={[hostile]} />, { wrapper });
    const region = await screen.findByRole("region", { name: "Proposition de l'agent" });
    expect(within(region).queryByRole("link")).toBeNull();
    expect(region.querySelector("img")).toBeNull();
    await userEvent.click(within(region).getByRole("button", { name: "Modifier" }));
    const field = within(region).getByRole("textbox", { name: "Texte de la proposition" });
    expect(field).toHaveValue("[x](http://evil.example) <img src=x onerror=alert(1)>");
    expect(within(region).queryByRole("link")).toBeNull();
    expect(agentMocks.decide).not.toHaveBeenCalled();
  });

  it("Accepter envoie la décision ; le texte modifié remplace celui de l'agent", async () => {
    agentMocks.decide.mockResolvedValue({ proposal: proposal({ status: "accepted" }), page: PAGE });
    render(<Space proposals={[proposal()]} />, { wrapper });
    const region = await screen.findByRole("region", { name: "Proposition de l'agent" });
    await userEvent.click(within(region).getByRole("button", { name: "Modifier" }));
    const field = within(region).getByRole("textbox", { name: "Texte de la proposition" });
    await userEvent.clear(field);
    await userEvent.type(field, "Mon texte");
    await userEvent.click(within(region).getByRole("button", { name: /Accepter/ }));
    await waitFor(() => expect(agentMocks.decide).toHaveBeenCalledTimes(1));
    expect(agentMocks.decide.mock.calls[0]?.[0]).toMatchObject({
      projectId: PROJECT,
      decision: "accept",
      contentMd: "Mon texte",
    });
  });

  it("raccourci R rejette, seulement avec le focus dans la proposition", async () => {
    agentMocks.decide.mockResolvedValue({ proposal: proposal({ status: "rejected" }), page: null });
    render(<Space proposals={[proposal()]} />, { wrapper });
    const region = await screen.findByRole("region", { name: "Proposition de l'agent" });
    await userEvent.keyboard("r");
    expect(agentMocks.decide).not.toHaveBeenCalled();
    within(region).getByRole("button", { name: "Modifier" }).focus();
    await userEvent.keyboard("r");
    await waitFor(() => expect(agentMocks.decide).toHaveBeenCalledTimes(1));
    expect(agentMocks.decide.mock.calls[0]?.[0]).toMatchObject({ decision: "reject" });
  });

  it("périmée : barrée, pas d'Accepter, « Redemander à l'agent »", async () => {
    render(<Space proposals={[proposal({ status: "stale" })]} />, { wrapper });
    const region = await screen.findByRole("region", { name: "Proposition de l'agent" });
    expect(
      within(region).getByText("Le texte a changé depuis cette proposition."),
    ).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: /Accepter/ })).toBeNull();
    expect(
      within(region).getByRole("button", { name: "Redemander à l'agent" }),
    ).toBeInTheDocument();
  });

  it("page éditée pendant la session : toutes les propositions deviennent périmées", async () => {
    render(<Space proposals={[proposal()]} stale />, { wrapper });
    const region = await screen.findByRole("region", { name: "Proposition de l'agent" });
    expect(within(region).queryByRole("button", { name: /Accepter/ })).toBeNull();
  });

  it("plusieurs propositions : « Proposition 1 sur 2 » et « 2 sur 2 »", async () => {
    render(
      <Space
        proposals={[
          proposal({ id: "01900000-0000-7000-8000-0000000000a1" }),
          proposal({ id: "01900000-0000-7000-8000-0000000000a2", anchorBlockIndex: 2 }),
        ]}
      />,
      { wrapper },
    );
    expect(await screen.findByText("Proposition 1 sur 2")).toBeInTheDocument();
    expect(screen.getByText("Proposition 2 sur 2")).toBeInTheDocument();
  });
});

describe("useIdeaProposals", () => {
  it("accepter : trace de la décision pendant 10 s, Annuler rétablit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    agentMocks.decide.mockResolvedValue({ proposal: proposal({ status: "accepted" }), page: PAGE });
    agentMocks.undo.mockResolvedValue({ proposal: proposal(), page: PAGE });
    const { result } = renderHook(() => useIdeaProposals(PROJECT), { wrapper });
    await act(async () => {
      await result.current.decide(proposal() as never, "accept");
    });
    expect(result.current.notices[0]?.text).toBe("Section ajoutée par l'agent, acceptée par vous.");
    expect(result.current.notices[0]?.undoable).toBe(true);
    await act(async () => {
      await result.current.undo(result.current.notices[0] as never);
    });
    expect(agentMocks.undo).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT, proposalId: proposal().id }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(result.current.notices).toHaveLength(0);
    vi.useRealTimers();
  });

  it("page proposée acceptée : pas d'Annuler", async () => {
    agentMocks.decide.mockResolvedValue({
      proposal: proposal({ status: "accepted" }),
      page: PAGE,
    });
    const { result } = renderHook(() => useIdeaProposals(PROJECT), { wrapper });
    await act(async () => {
      await result.current.decide(
        proposal({ op: "create_page", pageId: null, title: "Concurrence" }) as never,
        "accept",
      );
    });
    expect(result.current.notices[0]?.text).toBe("Page « Concurrence » ajoutée.");
    expect(result.current.notices[0]?.undoable).toBe(false);
  });

  it("conflit de version : message clair, aucune trace de succès", async () => {
    agentMocks.decide.mockRejectedValue(Object.assign(new Error("x"), { code: "CONFLICT" }));
    const { result } = renderHook(() => useIdeaProposals(PROJECT), { wrapper });
    await act(async () => {
      await result.current.decide(proposal() as never, "accept");
    });
    expect(result.current.error).toBe(
      "La page a changé depuis cette proposition : elle est périmée.",
    );
    expect(result.current.notices).toHaveLength(0);
  });
});

void PAGE_ID;
