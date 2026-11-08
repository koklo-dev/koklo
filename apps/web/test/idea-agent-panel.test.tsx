import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdeaAgentPanel } from "../src/components/idea-agent-panel.tsx";
import { useIdeaAgent } from "../src/lib/use-idea-agent.ts";
import { agentMocks, PROJECT, page, stream } from "./support/idea-agent.tsx";

vi.mock("../src/lib/orpc.ts", async () => (await import("./support/idea-agent.tsx")).fakeOrpc());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const PAGES = [page({ id: "p0", slug: "01-vision", title: "Vision" }), page()];

function Harness({ enabled = true }: { enabled?: boolean }) {
  const agent = useIdeaAgent({
    projectId: PROJECT,
    pages: PAGES as never,
    current: PAGES[1] as never,
    enabled,
  });
  return <IdeaAgentPanel agent={agent} current={PAGES[1] as never} onExplore={vi.fn()} />;
}

function open(status = { configured: true, canConfigure: true }) {
  agentMocks.status.mockResolvedValue(status);
  agentMocks.messages.mockResolvedValue({ items: [], nextCursor: null, total: 0 });
  agentMocks.getPage.mockResolvedValue({});
  agentMocks.list.mockResolvedValue({});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

const box = () => screen.findByRole("textbox", { name: "Message à l'agent" });

beforeEach(() => {
  for (const mock of Object.values(agentMocks)) mock.mockReset();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Panneau de l'agent (TK-90)", () => {
  it("dossier vide : premier message fixe, aucun appel d'IA", async () => {
    open();
    expect(
      await screen.findByText(
        "Qu'est-ce que ce produit change, et pour qui ? Une phrase suffit pour commencer.",
      ),
    ).toBeInTheDocument();
    expect(agentMocks.chat).not.toHaveBeenCalled();
    expect(agentMocks.gaps).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Mode de l'agent" })).toBeInTheDocument();
    expect(screen.getByText(/Mode entretien/)).toBeInTheDocument();
  });

  it("non configuré : alerte et lien pour un administrateur, guide statique, pas de saisie", async () => {
    open({ configured: false, canConfigure: true });
    expect(await screen.findByText(/aucune clé d'IA/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurer l'IA" })).toHaveAttribute(
      "href",
      "/settings/ai",
    );
    expect(screen.getByText("Qu'est-ce qui peut attendre ?")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message à l'agent" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Mode de l'agent" })).toBeNull();
    expect(agentMocks.chat).not.toHaveBeenCalled();
  });

  it("non configuré sans droit de configurer : demande à un administrateur", async () => {
    open({ configured: false, canConfigure: false });
    expect(
      await screen.findByText("Demandez à un administrateur de l'organisation d'ajouter la clé."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Configurer l'IA" })).toBeNull();
  });

  it("envoie le message, affiche le flux, puis la fin ; le texte reste littéral", async () => {
    agentMocks.chat.mockImplementation(async (_input, options) => {
      const at = "2026-11-08T10:00:0";
      agentMocks.messages.mockResolvedValue({
        items: [
          {
            id: "m0",
            pageId: null,
            author: { name: "Marie", isClient: true },
            mode: "interview",
            text: "Sur place au début",
            createdAt: `${at}1.000Z`,
          },
          {
            id: "m1",
            pageId: null,
            author: null,
            mode: "interview",
            text: "Noté. <img src=x> [lien](http://evil.example)",
            createdAt: `${at}2.000Z`,
          },
        ],
        nextCursor: null,
        total: 2,
      });
      return stream(
        [
          { type: "text", text: "Noté. <img src=x> " },
          { type: "text", text: "[lien](http://evil.example)" },
          { type: "done", messageId: "m1" },
        ],
        options?.signal,
      );
    });
    open();
    await userEvent.type(await box(), "Sur place au début");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(agentMocks.chat).toHaveBeenCalledTimes(1));
    expect(agentMocks.chat.mock.calls[0]?.[0]).toMatchObject({
      projectId: PROJECT,
      pageId: PAGES[1]?.id,
      mode: "interview",
      text: "Sur place au début",
    });
    expect(
      await screen.findByText("Noté. <img src=x> [lien](http://evil.example)"),
    ).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "lien" })).toBeNull();
    expect(screen.getByText("Sur place au début")).toBeInTheDocument();
    expect((await box()) as HTMLTextAreaElement).toHaveValue("");
  });

  it("Arrêter interrompt l'appel par le signal d'annulation", async () => {
    let signal: AbortSignal | undefined;
    agentMocks.chat.mockImplementation(async (_input, options) => {
      signal = options?.signal;
      return (async function* () {
        yield { type: "text", text: "début" };
        await new Promise((_, reject) =>
          signal?.addEventListener("abort", () => reject(new DOMException("a", "AbortError"))),
        );
      })();
    });
    open();
    await userEvent.type(await box(), "Bonjour");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await userEvent.click(await screen.findByRole("button", { name: "Arrêter" }));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Arrêter" })).toBeNull());
  });

  it("limite atteinte : alerte au-dessus de la saisie, saisie conservée", async () => {
    agentMocks.chat.mockRejectedValue(
      Object.assign(new Error("x"), { code: "LLM_RATE_LIMITED", data: { retryAfterSeconds: 5 } }),
    );
    open();
    await userEvent.type(await box(), "Ma réponse");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Trop de demandes pour le moment.")).toBeInTheDocument();
    expect((await box()) as HTMLTextAreaElement).toHaveValue("Ma réponse");
  });

  it("jamais le nom du fournisseur ; mention et détails de ce qui part", async () => {
    open();
    expect(
      await screen.findByText("Envoyé au fournisseur d'IA de l'organisation, avec sa clé."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/anthropic/i);
    await userEvent.click(screen.getByRole("button", { name: "Détails" }));
    expect(screen.getByText(/ne part jamais/i)).toBeInTheDocument();
  });

  it("mode Libre : message et indication changent", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Libre" }));
    expect(screen.getByText(/Mode libre/)).toBeInTheDocument();
  });

  it("« Ce qui manque encore » à la demande, 4 lignes au plus", async () => {
    agentMocks.gaps.mockResolvedValue({
      items: [
        { pageId: "p0", suggestedPageTitle: null, text: "aucun indicateur." },
        {
          pageId: null,
          suggestedPageTitle: "Concurrence",
          text: "Aucune page sur la concurrence.",
        },
      ],
      computedAt: "2026-11-08T10:00:00.000Z",
      cached: false,
    });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Voir ce qui manque" }));
    const card = await screen.findByRole("region", { name: "Manques détectés" });
    expect(within(card).getByText("01-vision")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Proposer une page" })).toBeInTheDocument();
  });
});
