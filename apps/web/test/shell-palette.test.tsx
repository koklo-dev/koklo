import type { SearchResult } from "@koklo/contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShellPalette } from "../src/components/shell-palette.tsx";
import { PROJECT_ID, polyfillRadix, resetWebMocks, router } from "./support/web-mocks.ts";

/** Faux client oRPC qui transmet le signal d'annulation de TanStack Query, comme le vrai (`queryFn({ signal })`). */
const calls = vi.hoisted(() => ({
  list: [] as Array<{ input: { q: string; projectId?: string }; signal: AbortSignal }>,
  answer: (_input: { q: string }): Promise<unknown> => Promise.resolve(null),
}));

vi.mock("next/navigation", async () => {
  const m = await import("./support/web-mocks.ts");
  return { useRouter: () => m.router, usePathname: () => m.pathname.current };
});
vi.mock("../src/lib/orpc.ts", () => ({
  orpc: {
    search: {
      query: {
        queryOptions: ({
          input,
          ...rest
        }: {
          input: { q: string; projectId?: string };
        } & Record<string, unknown>) => ({
          queryKey: ["search", "query", input],
          queryFn: ({ signal }: { signal: AbortSignal }) => {
            calls.list.push({ input, signal });
            return calls.answer(input);
          },
          ...rest,
        }),
      },
    },
  },
}));

const tickets = (count: number): SearchResult[] =>
  Array.from({ length: count }, (_, i) => ({
    kind: "ticket" as const,
    projectId: PROJECT_ID,
    key: `TK-${i + 1}`,
    title: `Ticket ${i + 1}`,
    status: "todo" as const,
  }));

function Harness({ canSettings = true }: { canSettings?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <input aria-label="Champ de la page" />
      <ShellPalette
        open={open}
        onOpenChange={setOpen}
        projectId={PROJECT_ID}
        available={["functional", "data"]}
        canSettings={canSettings}
      />
    </>
  );
}

function renderHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  calls.list.length = 0;
  calls.answer = () => Promise.resolve({ items: [], total: 0, nextCursor: null });
});

describe("ShellPalette : raccourci Ctrl K / ⌘ K (D1)", () => {
  it("Ctrl K ouvre la palette même depuis un champ de saisie, sans écrire dans le champ", async () => {
    renderHarness();
    const field = screen.getByRole("textbox", { name: "Champ de la page" });
    await userEvent.type(field, "ab");
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog", { name: "Recherche" })).toBeInTheDocument();
    expect(field).toHaveValue("ab");
  });

  it("⌘ K (Meta) ouvre aussi la palette depuis un champ", async () => {
    renderHarness();
    await userEvent.click(screen.getByRole("textbox", { name: "Champ de la page" }));
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog", { name: "Recherche" })).toBeInTheDocument();
  });

  it("Échap ferme et rend le focus au champ qui l'avait avant l'ouverture", async () => {
    renderHarness();
    const field = screen.getByRole("textbox", { name: "Champ de la page" });
    field.focus();
    await userEvent.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "Recherche" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(field).toHaveFocus();
  });
});

describe("ShellPalette : recherche serveur (D2)", () => {
  async function openAndType(text: string) {
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Recherche" });
    await userEvent.type(within(dialog).getByRole("combobox"), text);
    return dialog;
  }

  it("une frappe rapide ne part qu'une fois, après 200 ms, avec le projet courant", async () => {
    renderHarness();
    await openAndType("kanban");
    await waitFor(() => expect(calls.list).toHaveLength(1));
    expect(calls.list[0]?.input).toEqual({ q: "kanban", projectId: PROJECT_ID });
  });

  it("une nouvelle frappe annule la requête précédente encore en vol", async () => {
    calls.answer = () => new Promise(() => undefined);
    renderHarness();
    const dialog = await openAndType("ka");
    await waitFor(() => expect(calls.list).toHaveLength(1));
    await userEvent.type(within(dialog).getByRole("combobox"), "nb");
    await waitFor(() => expect(calls.list).toHaveLength(2));
    expect(calls.list[0]?.signal.aborted).toBe(true);
    expect(calls.list[1]?.signal.aborted).toBe(false);
  });

  it("20 résultats affichés sur 134 : le total vient du serveur", async () => {
    calls.answer = () => Promise.resolve({ items: tickets(20), total: 134, nextCursor: null });
    renderHarness();
    const dialog = await openAndType("zzz");
    await waitFor(() => expect(within(dialog).getAllByRole("option")).toHaveLength(20));
    expect(within(dialog).getByRole("status")).toHaveTextContent("134 résultats · 20 affichés");
  });

  it("un résultat ticket ouvre le tableau du projet ; une fonctionnalité, la fiche dans Fonctionnel", async () => {
    calls.answer = () =>
      Promise.resolve({
        items: [
          ...tickets(1),
          { kind: "feature", projectId: PROJECT_ID, specId: "F-012", title: "Export zzz" },
        ],
        total: 2,
        nextCursor: null,
      });
    renderHarness();
    const dialog = await openAndType("zzz");
    await userEvent.click(await within(dialog).findByRole("option", { name: /Export zzz/ }));
    expect(router.push).toHaveBeenLastCalledWith(
      `/projects/${PROJECT_ID}/spec/functional?tab=features&sel=F-012`,
    );
  });
});

describe("ShellPalette : pages filtrées localement (D4)", () => {
  it("le filtrage des pages suit la frappe tout de suite, sans attendre les 200 ms du serveur", async () => {
    renderHarness();
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Recherche" });
    await userEvent.type(within(dialog).getByRole("combobox"), "donn");
    expect(within(dialog).queryByRole("option", { name: /Idée/ })).toBeNull();
    expect(within(dialog).getByRole("option", { name: /Spec · Données/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(calls.list).toHaveLength(0);
  });

  it("« Données » (disponible) est proposée, « Architecture » (verrouillée) ne l'est jamais", async () => {
    renderHarness();
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Recherche" });
    const box = within(dialog).getByRole("combobox");
    await userEvent.type(box, "donn");
    expect(
      await within(dialog).findByRole("option", { name: /Spec · Données/ }),
    ).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, "archi");
    await waitFor(() =>
      expect(within(dialog).queryByRole("option", { name: /Architecture/ })).toBeNull(),
    );
  });
});
