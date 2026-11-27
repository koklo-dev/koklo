import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITED, RATE_LIMITED_TEXT } from "./support/git-read.ts";
import { fake, serveProposals } from "./support/proposals.tsx";
import { NO_ENVIRONMENTS, renderTechnical, serveTechnical } from "./support/technical.tsx";
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

const table = () => screen.findByRole("table", { name: "Environnements" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Environnements", () => {
  it("tableau : lignes dans l'ordre de la maquette, libellés français", async () => {
    serveTechnical("owner");
    renderTechnical({ search: "tab=environments" });
    const grid = await table();
    expect(
      within(grid)
        .getAllByRole("rowheader")
        .map((th) => th.textContent),
    ).toEqual(["Adresse", "Hébergement", "Base", "Données", "Déploiement", "SMS", "Accès"]);
    for (const text of [
      "Jeux d'exemple",
      "Copie anonymisée",
      "Réelles",
      "À chaque fusion sur main",
      "Sur validation d'une version",
    ]) {
      expect(within(grid).getByText(text)).toBeInTheDocument();
    }
    expect(within(grid).getByText("localhost:3000").className).toContain("font-mono");
  });

  it("variables par leur nom seul, intégrations avec leur statut", async () => {
    serveTechnical("owner");
    renderTechnical({ search: "tab=environments" });
    const variables = await screen.findByRole("region", { name: "Variables et secrets" });
    expect(variables).toHaveTextContent("Noms seulement : aucune valeur dans la spec");
    expect(within(variables).getAllByText("Coffre de l'hébergeur")).toHaveLength(2);
    const integrations = screen.getByRole("region", { name: "Intégrations externes" });
    for (const status of ["À trancher", "Compte à créer", "Configuré", "Connecté"]) {
      expect(within(integrations).getByText(status)).toBeInTheDocument();
    }
  });

  it("« Modifier » ouvre le menu des environnements, puis la feuille", async () => {
    serveTechnical("owner");
    renderTechnical({ search: "tab=environments" });
    await table();
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Recette" }));
    await waitFor(() => expect(window.location.search).toContain("edit=ENV-recette"));
    expect(await screen.findByRole("dialog", { name: "Modifier l'environnement" })).toBeVisible();
  });

  it("designer : lecture sans « Modifier »", async () => {
    serveTechnical("designer");
    renderTechnical({ search: "tab=environments" });
    await table();
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
  });

  it("aucun environnement : état vide avec « Nouvel environnement »", async () => {
    serveTechnical("owner", { environments: NO_ENVIRONMENTS });
    renderTechnical({ search: "tab=environments" });
    expect(await screen.findByText("Aucun environnement pour l'instant")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Nouvel environnement" }).length).toBeGreaterThan(
      0,
    );
  });
});

describe("Onglet Document du cahier technique", () => {
  it("lit les sections du livrable technique ; section à rédiger et colonne Agent", async () => {
    serveTechnical("owner");
    renderTechnical({ search: "tab=document&s=exploitation" });
    expect(await screen.findByText("tech/cahier-technique/02-exploitation.md")).toBeInTheDocument();
    expect(procedures.specDocumentSections).toHaveBeenCalledWith(
      expect.objectContaining({ deliverable: "technical" }),
    );
    expect(screen.getByText("Section à rédiger")).toBeInTheDocument();
    const agent = screen.getByRole("complementary", { name: "Agent" });
    expect(agent).toHaveTextContent("Vérifier la cohérence avec la stack et les exigences");
    expect(agent).toHaveTextContent("Exploitation : section vide.");
    expect(screen.queryByRole("button", { name: "Ajouter une section" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nouveau choix" })).toBeNull();
  });

  it("proposition de rédaction sur la section : acceptée ou rejetée sur place", async () => {
    serveTechnical("owner");
    serveProposals([
      fake(1, {
        kind: "doc_section",
        title: "Exploitation",
        content: {
          specId: "DOC-exploitation",
          title: "Exploitation",
          markdown: "Retour arrière en moins de 5 minutes.",
        },
      }),
    ]);
    renderTechnical({ search: "tab=document&s=exploitation&view=review" });
    const proposal = await screen.findByRole("region", { name: "Proposition de l'agent" });
    expect(proposal).toHaveTextContent("Proposition de l'agent · rédaction de la section");
    expect(proposal).toHaveTextContent("Retour arrière en moins de 5 minutes.");
    await userEvent.click(within(proposal).getByRole("button", { name: /Accepter/ }));
    await waitFor(() =>
      expect(procedures.proposalDecide.mock.calls[0]?.[0]).toMatchObject({ decision: "accept" }),
    );
  });

  it("quota GitHub : délai dans le message", async () => {
    serveTechnical("owner");
    procedures.specDocumentSections.mockRejectedValue(RATE_LIMITED);
    renderTechnical({ search: "tab=document" });
    expect(await screen.findByText(RATE_LIMITED_TEXT)).toBeInTheDocument();
  });
});
