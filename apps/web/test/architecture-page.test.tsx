import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPONENTS,
  componentRow,
  renderArchitecture,
  serveArchitecture,
} from "./support/architecture.tsx";
import { serveClientArchitecture } from "./support/architecture-client.tsx";
import { fake, LAUNCH_ID, serveProposals } from "./support/proposals.tsx";
import { polyfillRadix, procedures, resetWebMocks, router, watchUrl } from "./support/web-mocks.ts";

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

/** TK-111 lot C, cas 10 : Prêt, Génération, Relecture et Liste · équipe de l'écran Architecture ; droits. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const heading = () => screen.findByRole("heading", { level: 1, name: "Architecture" });
const tabsNav = () => screen.getByRole("navigation", { name: "Sections de l'architecture" });

const proposedComponent = (n: number, name: string) =>
  fake(n, {
    kind: "component",
    zone: "Communication",
    title: name,
    content: {
      name,
      type: "service",
      zone: "Communication",
      responsibility: "Envoie les rappels.",
      dependsOn: [{ to: "C-api", via: "HTTP" }],
    },
  });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Écran Architecture : Liste · équipe", () => {
  it("en-tête : titre, statut, résumé, Proposer, Nouveau composant puis Valider l'architecture", async () => {
    serveArchitecture("owner");
    renderArchitecture();
    await heading();
    expect(
      await screen.findByText("Validation de l'équipe · le client lit et commente"),
    ).toBeInTheDocument();
    expect(await screen.findByText("3 composants · 3 décisions · 2 flux")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Proposer avec l'agent/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Nouveau composant" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Valider l'architecture" })).toBeVisible();
  });

  it("onglets Schéma, Document, Composants, Décisions et Flux ; Schéma par défaut ; jamais Relecture", async () => {
    serveArchitecture("owner");
    renderArchitecture({ wide: true });
    await heading();
    await waitFor(() =>
      expect(
        within(tabsNav())
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(["Schéma", "Document", "Composants3", "Décisions3", "Flux2"]),
    );
    expect(within(tabsNav()).getByRole("link", { name: /Schéma/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const absent of [/Relecture/]) {
      expect(within(tabsNav()).queryByRole("link", { name: absent })).toBeNull();
    }
  });

  it("Composants : tableau à lignes de 52, type en pastille, Externe en pointillé, pied « Fin de la liste »", async () => {
    serveArchitecture("owner");
    renderArchitecture();
    const grid = await screen.findByRole("table", { name: "Composants de l'architecture" });
    expect(within(grid).getAllByRole("row")).toHaveLength(4);
    expect(within(grid).getByText("Application")).toBeInTheDocument();
    expect(within(grid).getByText("Externe").className).toMatch(/border-dashed/);
    expect(within(grid).getByText("Service").className).not.toMatch(/border-dashed/);
    expect(within(grid).getByText("ADR-001, ADR-002")).toBeInTheDocument();
    expect(within(grid).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Fin de la liste · 3 composants")).toBeInTheDocument();
  });

  it("Document : sections dans l'ordre des numéros, statuts écrits, légende collée en bas", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=document" });
    const nav = await screen.findByRole("navigation", { name: "Sections du document" });
    const items = within(nav).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^01.*Validée.*Contexte/),
        expect.stringMatching(/^02.*À relire.*Principes/),
        expect.stringMatching(/^03.*Brouillon.*Deploiement/),
        expect.stringMatching(/^04.*À rédiger.*Sauvegarde/),
      ]),
    );
    const legend = within(nav).getByRole("list", { name: "Légende des statuts" });
    expect(legend.textContent).toBe("ValidéeÀ relireBrouillonÀ rédiger");
    expect(legend.className).toMatch(/lg:mt-auto/);
    expect(
      within(nav)
        .getByRole("button", { name: /Contexte/ })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("Document : une section se lit en blocs de texte brut, son chemin et sa pastille ; « Marquer comme validée »", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=document&s=principes" });
    expect(await screen.findByText("architecture/overview/02-principes.md")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Principes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Principes" })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("listitem")
        .some((li) => /seule l'API écrit en base/.test(li.textContent ?? "")),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Marquer comme validée" })).toBeInTheDocument();
  });

  it("Document : section à rédiger, « Rédiger avec l'agent » ; colonne Agent sans conversation", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=document&s=sauvegarde" });
    expect(await screen.findByText("Section à rédiger")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rédiger avec l'agent/ })).toBeInTheDocument();
    const agent = screen.getByLabelText("Agent", { selector: "aside" });
    expect(within(agent).getByText("Demander")).toBeInTheDocument();
    expect(within(agent).getByText("Sauvegarde : section vide.")).toBeInTheDocument();
    expect(within(agent).queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Marquer comme validée" })).toBeNull();
  });

  it("un composant : le clic ouvre sa feuille de modification, Échap la ferme", async () => {
    serveArchitecture("owner");
    renderArchitecture();
    await userEvent.click(await screen.findByRole("button", { name: "Modifier C-api, API" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("Modifier le composant")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Écran Architecture : Prêt", () => {
  it("aucun composant, équipe qui écrit : la carte de l'agent, deux boutons, aucune action d'en-tête", async () => {
    serveArchitecture("owner", { rows: [] });
    renderArchitecture();
    expect(await screen.findByText("L'agent peut proposer l'architecture")).toBeInTheDocument();
    expect(
      screen.getByText(/À partir du cahier fonctionnel et du modèle de données validés/),
    ).toBeInTheDocument();
    expect(screen.getByText("Le fonctionnel et les données sont validés")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Proposer l'architecture" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Écrire à la main" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Nouveau composant" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Écrire à la main" }));
    expect(await screen.findByText("Nouveau composant")).toBeInTheDocument();
  });

  it("designer, aucun composant : état vide simple, sans bouton d'écriture", async () => {
    serveArchitecture("designer", { rows: [] });
    renderArchitecture();
    expect(await screen.findByText("Aucun composant pour l'instant")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Proposer|Nouveau composant|Écrire/ })).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Écran Architecture : Génération et Relecture", () => {
  it("Génération : bandeau d'état, sept cadres de 440, « Depuis le fonctionnel et les données »", async () => {
    serveArchitecture("owner");
    procedures.proposalList.mockResolvedValue({
      items: [],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 0,
      groups: [],
      launch: { id: LAUNCH_ID, status: "running", proposedCount: 0, discardedCount: 0 },
    });
    renderArchitecture({ search: "view=review" });
    expect(await screen.findByText("Depuis le fonctionnel et les données")).toBeInTheDocument();
    expect(
      screen.getByText(/L'agent rédige l'architecture zone par zone : composants, flux, décisions/),
    ).toBeInTheDocument();
    const frame = document.querySelector("[data-slot='data-generating']");
    expect(frame?.className).toMatch(/h-\[440px\]/);
    expect(frame?.querySelectorAll("[data-slot='skeleton']")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Annuler l'attente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Relecture/ })).toBeNull();
  });

  it("TK-112 (B549) : « un parcours sans flux » (ARCH_FLOW_MISSING) s'affiche en relecture, jamais bloquant", async () => {
    serveArchitecture("owner", {
      warnings: [
        {
          code: "ARCH_FLOW_MISSING",
          entityId: "P-reserver",
          message: "Le parcours P-reserver n'a pas de flux.",
        },
      ],
    });
    serveProposals([proposedComponent(1, "Passerelle SMS")]);
    renderArchitecture({ search: "view=review" });
    expect(await screen.findByText("Le parcours P-reserver n'a pas de flux.")).toBeVisible();
    expect(
      screen.getByText("Avertissements d'architecture · 1 · Ils n'empêchent pas l'enregistrement."),
    ).toBeVisible();
  });

  it("Relecture : En cours, N propositions, onglet Relecture devant, bandeau, groupes par type, avertissements", async () => {
    serveArchitecture("owner", {
      warnings: [
        {
          code: "ARCH_TABLE_UNOWNED",
          entityId: "T-avis",
          message: "La table T-avis n'a aucun propriétaire.",
        },
      ],
    });
    serveProposals([
      proposedComponent(1, "Passerelle SMS"),
      fake(2, {
        kind: "doc_section",
        zone: "",
        title: "Observabilité",
        content: { title: "Observabilité", markdown: "Alerte en moins de 5 min." },
      }),
    ]);
    renderArchitecture({ search: "view=review" });
    expect(await screen.findByText("2 propositions à relire")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(tabsNav())
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(["Relecture2", "Schéma", "Document", "Composants4", "Décisions3", "Flux2"]),
    );
    expect(within(tabsNav()).getAllByRole("link")[0]).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("group", { name: "Mode relecture" })).toHaveTextContent(
      "l'agent propose 2 éléments depuis le fonctionnel et les données · 0 accepté · 2 à relire",
    );
    expect(await screen.findByText("La table T-avis n'a aucun propriétaire.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reproposer" })).toBeInTheDocument();
  });

  it("Relecture : un composant proposé se lit en responsabilité, dépendances et type, sans bouton « Modifier »", async () => {
    serveArchitecture("owner");
    serveProposals([proposedComponent(1, "Passerelle SMS")]);
    renderArchitecture({ search: "view=review" });
    expect(await screen.findByText("Envoie les rappels.")).toBeInTheDocument();
    expect(screen.getByText("C-api · HTTP")).toBeInTheDocument();
    expect(screen.getAllByText("C-passerelle-sms").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
  });

  it("Relecture : l'onglet Composants montre le composant proposé avec « À relire », sous les composants de la spec", async () => {
    serveArchitecture("owner");
    serveProposals([proposedComponent(1, "Passerelle SMS")]);
    renderArchitecture({ search: "view=review&tab=components" });
    const grid = await screen.findByRole("table", { name: "Composants de l'architecture" });
    await waitFor(() => expect(within(grid).getAllByRole("row")).toHaveLength(5));
    expect(within(grid).getByText("Passerelle SMS")).toBeInTheDocument();
    expect(within(grid).getByText("À relire")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Mode relecture" })).toBeInTheDocument();
  });

  it("Relecture : la section proposée se décide dans la colonne Sections (Ajouter la section, Ignorer)", async () => {
    serveArchitecture("owner");
    serveProposals([
      fake(1, {
        kind: "doc_section",
        zone: "",
        title: "Observabilité",
        rationale: "NFR-005 demande une alerte en moins de 5 min.",
        content: { title: "Observabilité", markdown: "Alerte." },
      }),
    ]);
    renderArchitecture({ search: "view=review&tab=document" });
    const card = await screen.findByRole("group", { name: "Section proposée par l'agent" });
    expect(within(card).getByText("NFR-005 demande une alerte en moins de 5 min.")).toBeVisible();
    await userEvent.click(within(card).getByRole("button", { name: "Ajouter la section" }));
    await waitFor(() => expect(procedures.proposalDecide).toHaveBeenCalled());
    expect(procedures.proposalDecide.mock.calls[0]?.[0]).toMatchObject({ decision: "accept" });
  });

  it("« Quitter la relecture » retire view=review", async () => {
    serveArchitecture("owner");
    serveProposals([proposedComponent(1, "Passerelle SMS")]);
    renderArchitecture({ search: "view=review" });
    await userEvent.click(await screen.findByRole("button", { name: "Quitter la relecture" }));
    await waitFor(() => expect(window.location.search).toBe(""));
  });
});

describe("Écran Architecture : droits", () => {
  it.each(["client", "business"] as const)(
    "%s : vue en lecture seule (clientSpace), aucune lecture spec.architecture, pas de redirection",
    async (role) => {
      serveClientArchitecture(role);
      renderArchitecture();
      expect(await screen.findByText(/Lecture seule\./)).toBeVisible();
      expect(router.replace).not.toHaveBeenCalled();
      for (const name of [
        "specArchitectureComponentsList",
        "specArchitectureDocument",
        "specArchitectureAdrList",
        "specArchitectureFlowsList",
        "specArchitectureSource",
      ] as const) {
        expect(procedures[name]).not.toHaveBeenCalled();
      }
    },
  );

  it("designer : lit sans aucun bouton d'écriture ni agent ; une ligne n'est pas un bouton", async () => {
    serveArchitecture("designer");
    renderArchitecture();
    await heading();
    await screen.findByRole("table", { name: "Composants de l'architecture" });
    expect(
      screen.queryByRole("button", { name: /Proposer|Nouveau composant|Modifier/ }),
    ).toBeNull();
    expect(procedures.aiProposeOptions).not.toHaveBeenCalled();
  });

  it("designer : la section se lit sans « Marquer comme validée » ni demande à l'agent", async () => {
    serveArchitecture("designer");
    renderArchitecture({ search: "tab=document&s=principes" });
    await screen.findByText("architecture/overview/02-principes.md");
    expect(screen.queryByRole("button", { name: "Marquer comme validée" })).toBeNull();
    expect(screen.queryByText("Demander")).toBeNull();
  });
});

describe("Écran Architecture : états de lecture", () => {
  it("erreur de la liste : message et « Réessayer »", async () => {
    serveArchitecture("owner", { fail: new Error("boom") });
    renderArchitecture();
    expect(await screen.findByText("Impossible de charger l'architecture")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("recherche sans résultat : message et « Effacer la recherche »", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "q=zzz" });
    expect(await screen.findByText("Aucun composant ne correspond à « zzz »")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Effacer la recherche" })).toBeInTheDocument();
  });

  it("lien direct ?c= hors page 1 : la page qui contient le composant s'ouvre, la ligne est repérée", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => componentRow(i + 1));
    serveArchitecture("owner", { rows });
    renderArchitecture({ search: "c=C-composant-075" });
    const row = await waitFor(() => {
      const found = document.querySelector("[data-spec-id='C-composant-075']");
      if (!found) throw new Error("ligne absente");
      return found;
    });
    expect(row).toHaveAttribute("aria-current", "true");
    expect(procedures.specArchitectureComponentsList.mock.calls[0]?.[0]).toMatchObject({
      around: "C-composant-075",
    });
  });

  it("120 composants : pages de 50, pied « Les 50 suivants », total du serveur", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => componentRow(i + 1));
    serveArchitecture("owner", { rows });
    renderArchitecture();
    const grid = await screen.findByRole("table", { name: "Composants de l'architecture" });
    expect(within(grid).getAllByRole("row")).toHaveLength(51);
    expect(screen.getByText(/Les 50 suivants se chargent/)).toBeInTheDocument();
    expect(procedures.specArchitectureComponentsList.mock.calls[0]?.[0]).toMatchObject({
      limit: 50,
    });
    expect(COMPONENTS).toHaveLength(3);
  });
});
