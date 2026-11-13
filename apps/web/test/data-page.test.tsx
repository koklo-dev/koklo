import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_ID, renderData, serveData, tabNamed } from "./support/data.tsx";
import { serveClientData } from "./support/data-client.tsx";
import { SHORT_SHA } from "./support/features.tsx";
import { fake, serveProposals } from "./support/proposals.tsx";
import { findNamed } from "./support/wait.ts";
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

/** TK-107 lot C, critères 13 et 19 : les quatre états de l'écran Données, l'en-tête par état, les droits. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const heading = () => screen.findByRole("heading", { level: 1, name: "Modèle de données" });
const table = (title: string, project = PROJECT_ID, n = 1) =>
  fake(n, {
    kind: "table",
    zone: "Prise de rendez-vous",
    title,
    content: {
      name: title,
      sources: ["F-001"],
      fields: [
        { name: "id", type: "uuid", primaryKey: true },
        { name: "nom", type: "texte(80)" },
      ],
    },
    ...(project ? {} : {}),
  });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Écran Données : Liste · équipe", () => {
  it("en-tête : titre, statut, résumé des compteurs, deux actions dont l'ajout, jamais « Valider »", async () => {
    serveData("owner");
    renderData();
    await heading();
    expect(
      await screen.findByText("Validation de l'équipe · le client lit et commente"),
    ).toBeInTheDocument();
    expect(screen.getByText("3 tables · 2 relations · 1 jeu d'exemple")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Proposer avec l'agent/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter une table" })).toBeInTheDocument();
    expect(screen.queryByText(/Valider le modèle/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Commenter/ })).toBeNull();
  });

  it("onglets Diagramme, Tables et Jeux d'exemple avec leurs compteurs, sans Relecture", async () => {
    serveData("owner");
    renderData({ search: "tab=tables" });
    await heading();
    const nav = await screen.findByRole("navigation", { name: "Sections du modèle de données" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual([
      expect.stringContaining("Diagramme"),
      expect.stringContaining("Tables"),
      expect.stringContaining("Jeux d'exemple"),
    ]);
    expect(within(nav).getByRole("link", { name: /Tables/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).queryByRole("link", { name: /Relecture/ })).toBeNull();
  });

  it("sans paramètre, l'onglet Diagramme s'ouvre sur le lecteur, une carte bouton par table", async () => {
    serveData("owner");
    renderData();
    const region = await screen.findByRole("region", { name: "Diagramme entité-relation" });
    expect(within(region).getAllByRole("button", { name: /^Table / })).toHaveLength(3);
    expect(
      within(region).getByRole("button", { name: "Table Client, 3 champs" }),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-kind='reference']")).not.toBeNull();
  });

  it("le diagramme a sa barre de zoom et ses traits, sans bouton « Valider » ni « Commenter »", async () => {
    serveData("owner");
    renderData();
    await screen.findByRole("region", { name: "Diagramme entité-relation" });
    expect(screen.getByRole("toolbar", { name: "Zoom du diagramme" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Valider|Commenter/i })).toBeNull();
    expect(document.querySelector("svg line")).not.toBeNull();
  });
});

describe("Écran Données : Prêt", () => {
  it("modèle vide, équipe qui écrit : la carte de l'agent avec les compteurs du cahier, sans action d'en-tête", async () => {
    serveData("owner", { rows: [] });
    renderData();
    expect(
      await screen.findByText("L'agent peut proposer le modèle de données"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /À partir du cahier fonctionnel enregistré : 7 fonctionnalités, 4 règles, 3 rôles, 2 parcours/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Le cahier fonctionnel est enregistré")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Proposer le modèle de données" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ajouter une table" })).toHaveLength(1);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Écran Données : Génération et Relecture", () => {
  it("Génération : « Depuis le cahier fonctionnel », bandeau d'état, six cadres, Proposer indisponible", async () => {
    serveData("owner");
    serveProposals([fake(1, { kind: "table" })].slice(0, 0));
    procedures.proposalList.mockResolvedValue({
      items: [],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 0,
      groups: [],
      launch: {
        id: "0190aaaa-0000-7000-8000-000000000001",
        status: "running",
        proposedCount: 0,
        discardedCount: 0,
      },
    });
    renderData({ search: "view=review" });
    expect(await screen.findByText("Depuis le cahier fonctionnel")).toBeInTheDocument();
    expect(
      screen.getByText(/L'agent déduit les tables et les relations du cahier fonctionnel/),
    ).toBeInTheDocument();
    expect(
      document.querySelectorAll("[data-slot='data-generating'] [data-slot='skeleton']"),
    ).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Annuler l'attente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter une table" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Relecture/ })).toBeNull();
  });

  it("Relecture : En cours, « N propositions à relire », onglet Relecture devant Diagramme, bandeau et liste", async () => {
    serveData("owner");
    serveProposals([table("Avis", PROJECT_ID, 1), table("Option", PROJECT_ID, 2)]);
    renderData({ search: "view=review" });
    expect(await screen.findByText("2 propositions à relire")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Sections du modèle de données" });
    const links = within(nav).getAllByRole("link");
    expect(links[0]?.textContent).toContain("Relecture");
    expect(links[0]?.textContent).toBe("Relecture2");
    expect(links[1]?.textContent).toContain("Diagramme");
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("group", { name: "Mode relecture" })).toHaveTextContent(
      "l'agent propose 2 éléments depuis le cahier fonctionnel · 0 accepté · 2 à relire",
    );
    expect(screen.getByRole("button", { name: "Reproposer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter une table" })).toBeInTheDocument();
  });

  it("Relecture : une table proposée se lit en tableau Champ / Type / Contraintes, ses sources en pastilles", async () => {
    serveData("owner");
    serveProposals([table("Avis", PROJECT_ID, 1)]);
    renderData({ search: "view=review" });
    const grid = await screen.findByRole("table", { name: "Champs de la table" });
    expect(within(grid).getByText("uuid")).toBeInTheDocument();
    expect(within(grid).getByText("Clé primaire")).toBeInTheDocument();
    expect(screen.getAllByText("F-001").length).toBeGreaterThan(0);
  });

  it("Relecture : les onglets de lecture montrent le modèle proposé (pointillés, estompée par les jetons) avec le bandeau", async () => {
    serveData("owner");
    const rejected = table("Facture", PROJECT_ID, 2);
    rejected.status = "rejected";
    serveProposals([table("Avis", PROJECT_ID, 1), rejected]);
    renderData({ search: "view=review&tab=diagram" });
    const list = await screen.findByRole("region", { name: "Diagramme entité-relation" });
    await waitFor(() =>
      expect(within(list).getAllByRole("button", { name: /^Table / })).toHaveLength(5),
    );
    expect(
      within(list)
        .getByRole("button", { name: "Table Avis, 2 champs" })
        .closest("[data-slot='er-table-card']"),
    ).toHaveClass("border-dashed");
    expect(
      within(list)
        .getByRole("button", { name: "Table Facture, 2 champs" })
        .closest("[data-slot='er-table-card']"),
    ).toHaveClass("text-muted-foreground");
    expect(within(list).getByText("À relire")).toBeInTheDocument();
    expect(within(list).getByText("Rejetée")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Mode relecture" })).toBeInTheDocument();
    expect(screen.getByText(/Pointillés : proposition à relire/)).toBeInTheDocument();
  });

  it("Relecture : les relations proposées relient les cartes proposées, sauf si la proposition est rejetée", async () => {
    serveData("owner");
    const relations = (status: "pending" | "rejected") => ({
      ...fake(3, { kind: "relations" }),
      status,
      content: { relations: [{ from: "T-avis", to: "T-facture", cardinality: "n → 1" }] },
    });
    for (const [status, expected] of [
      ["pending", 1],
      ["rejected", 0],
    ] as const) {
      serveProposals([
        table("Avis", PROJECT_ID, 1),
        table("Facture", PROJECT_ID, 2),
        relations(status),
      ]);
      const view = renderData({ search: "view=review&tab=diagram" });
      const list = await screen.findByRole("region", { name: "Diagramme entité-relation" });
      await userEvent.click(
        await within(list).findByRole("button", { name: "Table Avis, 2 champs" }),
      );
      const fiche = await screen.findByRole("complementary", { name: "Fiche de la table" });
      expect(within(fiche).queryAllByText("Avis → Facture")).toHaveLength(expected);
      view.unmount();
    }
  });

  it("« Quitter la relecture » retire view=review et revient à la liste", async () => {
    serveData("owner");
    serveProposals([table("Avis", PROJECT_ID, 1)]);
    renderData({ search: "view=review" });
    await userEvent.click(await screen.findByRole("button", { name: "Quitter la relecture" }));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(
      await screen.findByRole("region", { name: "Diagramme entité-relation" }),
    ).toBeInTheDocument();
  });

  it("une proposition du lancement ouvre la relecture au chargement, une seule fois", async () => {
    serveData("owner");
    serveProposals([table("Avis", PROJECT_ID, 1)]);
    renderData();
    await waitFor(() => expect(window.location.search).toContain("view=review"));
  });
});

describe("Écran Données : droits", () => {
  it("designer : il lit le modèle, sans « Ajouter une table » ni « Proposer »", async () => {
    serveData("designer");
    renderData();
    await screen.findByRole("region", { name: "Diagramme entité-relation" });
    expect(screen.queryByRole("button", { name: "Ajouter une table" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Proposer/ })).toBeNull();
    expect(procedures.aiProposeOptions).not.toHaveBeenCalled();
  });

  it.each(["client", "business"] as const)(
    "%s : la vue client lit le modèle validé, plus « réservée à l'équipe », aucune lecture d'équipe",
    async (role) => {
      serveClientData(role);
      renderData();
      expect(await screen.findByRole("note")).toHaveTextContent("Lecture seule.");
      expect(screen.queryByText("Cette page est réservée à l'équipe")).toBeNull();
      expect(procedures.specDataTablesList).not.toHaveBeenCalled();
      expect(procedures.specDataMermaid).not.toHaveBeenCalled();
      expect(procedures.proposalList).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Ajouter une table" })).toBeNull();
    },
  );

  it("un owner voit l'empreinte de la spec", async () => {
    serveData("owner");
    renderData();
    await heading();
    expect(await screen.findByText(SHORT_SHA)).toBeInTheDocument();
    await findNamed("link", /Tables/, { hidden: true });
    expect(tabNamed(/Tables/)).toBeInTheDocument();
  });
});
