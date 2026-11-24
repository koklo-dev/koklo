import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderArchitecture, serveArchitecture } from "./support/architecture.tsx";
import { batch, lastSubmit, submitInputs } from "./support/feature-form.tsx";
import { RATE_LIMITED, RATE_LIMITED_TEXT } from "./support/git-read.ts";
import { fake, serveProposals } from "./support/proposals.tsx";
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

/** TK-111 lot C, cas 8 : onglet Document (ordre, statuts, légende, section proposée, validation, agent). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Document : lecture", () => {
  it("choisir une section l'écrit dans l'adresse (?s=) et ouvre son texte", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=document" });
    const nav = await screen.findByRole("navigation", { name: "Sections du document" });
    await userEvent.click(within(nav).getByRole("button", { name: /Deploiement/ }));
    await waitFor(() => expect(window.location.search).toBe("?tab=document&s=deploiement"));
    expect(await screen.findByText("architecture/overview/03-deploiement.md")).toBeInTheDocument();
    expect(
      screen.getByText("Un environnement de recette et un de production."),
    ).toBeInTheDocument();
    expect(
      within(nav)
        .getByRole("button", { name: /Deploiement/ })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("aucune section : message, l'agent reste proposé", async () => {
    serveArchitecture("owner", { sections: [] });
    renderArchitecture({ search: "tab=document" });
    expect(await screen.findByText(/Aucune section pour l'instant/)).toBeInTheDocument();
  });

  it("le document ne se charge pas depuis l'onglet Composants", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=components" });
    await screen.findByRole("table", { name: "Composants de l'architecture" });
    expect(procedures.specArchitectureDocument).not.toHaveBeenCalled();
  });

  it("erreur de lecture : message et « Réessayer »", async () => {
    serveArchitecture("owner");
    procedures.specArchitectureDocument.mockRejectedValue(new Error("boom"));
    renderArchitecture({ search: "tab=document" });
    expect(await screen.findByText("Impossible de charger le document")).toBeInTheDocument();
    expect(screen.getByText("Réessayez dans un instant.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("quota GitHub épuisé : délai dans le message, « Réessayer » relance la lecture (TK-114f)", async () => {
    serveArchitecture("owner");
    procedures.specArchitectureDocument.mockRejectedValueOnce(RATE_LIMITED);
    renderArchitecture({ search: "tab=document" });
    expect(await screen.findByText("Impossible de charger le document")).toBeInTheDocument();
    expect(screen.getByText(RATE_LIMITED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText("Réessayez dans un instant.")).toBeNull();
    const calls = procedures.specArchitectureDocument.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() =>
      expect(procedures.specArchitectureDocument.mock.calls.length).toBe(calls + 1),
    );
    await waitFor(() => expect(screen.queryByText(RATE_LIMITED_TEXT)).toBeNull());
  });

  it("le texte brut n'est jamais interprété : une balise reste du texte", async () => {
    serveArchitecture("owner", {
      sections: [
        {
          specId: "DOC-x",
          slug: "x",
          num: 1,
          path: "architecture/overview/01-x.md",
          title: "X",
          status: "brouillon",
          markdown: "<img src=x onerror=alert(1)>",
          updatedAt: null,
          lastAuthor: null,
        },
      ],
    });
    renderArchitecture({ search: "tab=document" });
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("article img")).toBeNull();
  });
});

describe("Onglet Document : actions de l'équipe", () => {
  it("« Marquer comme validée » envoie doc.section.update du statut seul", async () => {
    serveArchitecture("owner");
    procedures.specBatchSubmit.mockResolvedValue(
      batch({ results: [{ position: 0, kind: "doc.section.update", specId: "DOC-principes" }] }),
    );
    procedures.specBatchGet.mockResolvedValue(
      batch({ results: [{ position: 0, kind: "doc.section.update", specId: "DOC-principes" }] }),
    );
    renderArchitecture({ search: "tab=document&s=principes" });
    await userEvent.click(await screen.findByRole("button", { name: "Marquer comme validée" }));
    await waitFor(() => expect(submitInputs()).toHaveLength(1));
    expect(lastSubmit().operations).toEqual([
      { kind: "doc.section.update", specId: "DOC-principes", status: "validee" },
    ]);
    expect(lastSubmit()).toMatchObject({ baseSha: "a".repeat(40) });
  });

  it("une action rapide de la colonne Agent ouvre la fenêtre du lancement avec le mode « Rédiger le document »", async () => {
    serveArchitecture("owner");
    procedures.aiProposeOptions.mockResolvedValue({
      options: [
        { id: "complete", recommended: true },
        { id: "decision", recommended: false },
        { id: "document", count: 1, recommended: false },
        { id: "all", recommended: false },
      ],
      reads: [{ id: "functional", label: "Fonctionnel" }],
      available: true,
    });
    renderArchitecture({ search: "tab=document" });
    await userEvent.click(await screen.findByRole("button", { name: "Résumer pour le client" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Rédiger le document")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue(/Résumer le document en langage simple/)).toBeVisible();
  });

  it("section proposée : « Ignorer » rejette la proposition", async () => {
    serveArchitecture("owner");
    serveProposals([
      fake(1, {
        kind: "doc_section",
        zone: "",
        title: "Observabilité",
        content: { title: "Observabilité", markdown: "Alerte." },
      }),
    ]);
    renderArchitecture({ search: "view=review&tab=document" });
    const card = await screen.findByRole("group", { name: "Section proposée par l'agent" });
    await userEvent.click(within(card).getByRole("button", { name: "Ignorer" }));
    await waitFor(() => expect(procedures.proposalDecide).toHaveBeenCalled());
    expect(procedures.proposalDecide.mock.calls[0]?.[0]).toMatchObject({ decision: "reject" });
  });
});
