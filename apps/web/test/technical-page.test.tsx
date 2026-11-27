import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fake, LAUNCH_ID, serveProposals } from "./support/proposals.tsx";
import {
  NO_ENVIRONMENTS,
  renderTechnical,
  serveTechnical,
  technicalHeading,
} from "./support/technical.tsx";
import {
  polyfillRadix,
  procedures,
  resetWebMocks,
  router,
  specDeliverables,
  watchUrl,
} from "./support/web-mocks.ts";

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

const tabs = () => screen.getByRole("navigation", { name: "Sections du cahier technique" });

const proposals = () => [
  fake(1, {
    kind: "doc_section",
    title: "Exploitation",
    content: { title: "Exploitation", markdown: "Déploiement continu en recette." },
  }),
  fake(2, {
    kind: "stack",
    title: "Fournisseur SMS",
    content: {
      role: "Fournisseur SMS",
      status: "open",
      components: ["C-sms"],
      options: ["Brevo", "Twilio"],
      criteria: [{ label: "Données en UE", values: ["Oui", "Non"] }],
      why: "À comparer.",
      requirements: [],
      decisions: ["ADR-006"],
    },
  }),
];

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Page Technique : liste de l'équipe", () => {
  it("en-tête : titre, statut, résumé, agent et « Nouveau choix », jamais « Valider »", async () => {
    serveTechnical("owner");
    renderTechnical();
    await technicalHeading();
    expect(
      await screen.findByText("Validation de l'équipe · le client lit et commente"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "3 choix · 132 opérations · 28 exigences · 3 environnements · 1 choix à trancher avant de valider",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Proposer avec l'agent/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Nouveau choix" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Valider/ })).toBeNull();
  });

  it("onglets Stack, Environnements et Document seulement (ni API ni Exigences)", async () => {
    serveTechnical("owner");
    renderTechnical();
    await technicalHeading();
    await waitFor(() =>
      expect(
        within(tabs())
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(["Stack3", "Environnements3", "Document"]),
    );
    expect(within(tabs()).getByRole("link", { name: /Stack/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("designer : lecture sans écriture, sans lecture des propositions", async () => {
    serveTechnical("designer");
    renderTechnical();
    expect(await screen.findByRole("button", { name: /Fournisseur SMS/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Proposer avec l'agent/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nouveau choix" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Choisir/ })).toBeNull();
    expect(procedures.proposalList).not.toHaveBeenCalled();
    expect(procedures.aiProposeOptions).not.toHaveBeenCalled();
  });

  it("fenêtre de l'agent : textes de la maquette 14, compte des choix à trancher", async () => {
    serveTechnical("owner");
    procedures.aiProposeOptions.mockResolvedValue({
      options: [
        { id: "complete", recommended: true },
        { id: "compare", count: 1, recommended: false },
        { id: "nfr", recommended: false },
        { id: "all", recommended: false },
      ],
      reads: [
        { id: "architecture.current", label: "Architecture validée" },
        { id: "nfr.known", label: "Exigences" },
      ],
      available: true,
    });
    renderTechnical();
    await userEvent.click(await screen.findByRole("button", { name: /Proposer avec l'agent/ }));
    const dialog = await screen.findByRole("dialog");
    for (const text of [
      "Cahier technique",
      "Compléter le cahier",
      "Opérations de l'API, exigences et variables qui manquent.",
      "Comparer les options d'un choix",
      "1 choix à trancher",
      "Rendre les exigences mesurables",
      "Tout reproposer",
      "Architecture validée",
    ]) {
      expect(await within(dialog).findByText(text, { exact: false })).toBeInTheDocument();
    }
    expect(procedures.aiProposeOptions).toHaveBeenCalledWith(
      expect.objectContaining({ deliverable: "technical" }),
    );
  });

  it("Prêt : l'agent ou « Écrire à la main », sans action d'en-tête", async () => {
    serveTechnical("owner", {
      choices: [],
      environments: NO_ENVIRONMENTS,
      sections: [],
      counts: { endpoints: 0, nfr: 0 },
    });
    renderTechnical();
    expect(
      await screen.findByText("L'agent peut proposer le cahier technique"),
    ).toBeInTheDocument();
    expect(screen.getByText("L'architecture est validée")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Proposer le cahier technique/ }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Nouveau choix" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Écrire à la main" }));
    expect(await screen.findByRole("dialog", { name: "Nouveau choix technique" })).toBeVisible();
  });

  it("Génération : bandeau d'état et « Annuler l'attente »", async () => {
    serveTechnical("owner");
    procedures.proposalList.mockResolvedValue({
      items: [],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 0,
      groups: [],
      launch: { id: LAUNCH_ID, status: "running", proposedCount: 0, discardedCount: 0 },
    });
    renderTechnical({ search: "view=review" });
    expect(
      await screen.findByText(/L'agent rédige le cahier technique : la stack d'abord/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler l'attente" })).toBeVisible();
    expect(screen.getByText("Depuis l'architecture")).toBeInTheDocument();
  });

  it("Relecture : onglet devant, résumé depuis l'architecture, section proposée en 15 px", async () => {
    serveTechnical("owner");
    serveProposals(proposals());
    renderTechnical({ search: "view=review" });
    expect(
      await screen.findByText(/l'agent propose 2 éléments depuis l'architecture/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(tabs()).getAllByRole("link")[0]).toHaveTextContent("Relecture2"),
    );
    const text = await screen.findByText("Déploiement continu en recette.");
    expect(text.className).toContain("--text-prose-body-size");
    await userEvent.click(screen.getByRole("button", { name: /Fournisseur SMS : À trancher/ }));
    expect(await screen.findByText("Brevo · Twilio")).toBeInTheDocument();
    expect(screen.getByText("Brevo : Oui · Twilio : Non")).toBeInTheDocument();
  });

  it("Relecture d'un choix : « rôle : option », pourquoi sous le titre, « En clair » (B764)", async () => {
    serveTechnical("owner");
    serveProposals([
      fake(1, {
        kind: "stack",
        title: "File de tâches",
        rationale: "Justification de l'agent.",
        content: {
          role: "File de tâches",
          status: "chosen",
          choice: "pg-boss",
          components: ["C-api"],
          options: ["pg-boss", "BullMQ"],
          criteria: [{ label: "Exploitation", values: ["Simple", "Redis en plus"] }],
          why: "Aucun service de plus à exploiter.",
          plain: "Les tâches de fond passent par la base.",
          requirements: [],
          decisions: [],
        },
      }),
    ]);
    renderTechnical({ search: "view=review" });
    expect(
      await screen.findByRole("heading", { level: 2, name: "File de tâches : pg-boss" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /File de tâches : pg-boss/ })).toHaveTextContent(
      "Choix · choisi",
    );
    expect(screen.getByText("Aucun service de plus à exploiter.")).toBeInTheDocument();
    expect(screen.queryByText("Justification de l'agent.")).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "En clair" })).toBeInTheDocument();
    expect(screen.getByText("Les tâches de fond passent par la base.")).toBeInTheDocument();
  });

  it("des opérations ou des exigences sans choix ni environnement : pas d'état « Prêt »", async () => {
    serveTechnical("owner", {
      choices: [],
      environments: NO_ENVIRONMENTS,
      counts: { endpoints: 12, nfr: 0 },
    });
    renderTechnical();
    expect(await screen.findByRole("button", { name: "Nouveau choix" })).toBeVisible();
    expect(screen.queryByText("L'agent peut proposer le cahier technique")).toBeNull();
  });

  it("Relecture, onglet Environnements : « Ajouter » ouvre la feuille Environnement", async () => {
    serveTechnical("owner");
    serveProposals(proposals());
    renderTechnical({ search: "tab=environments&view=review" });
    await userEvent.click(await screen.findByRole("button", { name: "Ajouter" }));
    expect(await screen.findByRole("dialog", { name: "Nouvel environnement" })).toBeVisible();
  });

  it("À revoir : changements, éléments concernés, « Voir les changements » vers l'Architecture", async () => {
    serveTechnical("owner");
    procedures.specDeliverables.mockResolvedValue(
      specDeliverables({
        open: new Set(["technical", "architecture"]),
        status: { technical: "revise" },
        staleTechnical: {
          changes: [
            { id: "C-avis", change: "added" },
            { id: "ADR-006", change: "accepted" },
          ],
          items: ["ST-sms", "NFR-004"],
        },
      }),
    );
    renderTechnical();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("L'architecture a changé depuis la validation");
    expect(alert).toHaveTextContent("Composant C-avis ajouté, ADR-006 acceptée.");
    expect(alert).toHaveTextContent(
      "Sont concernés : ST-sms, NFR-004, surlignés dans les onglets.",
    );
    expect(await screen.findByRole("button", { name: /Fournisseur SMS.*à revoir/ })).toBeVisible();
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Proposer les mises à jour" }).length).toBe(2),
    );
    await userEvent.click(within(alert).getByRole("button", { name: "Voir les changements" }));
    expect(router.push).toHaveBeenCalledWith(
      expect.stringContaining("/spec/architecture?sel=C-avis"),
    );
  });
});
