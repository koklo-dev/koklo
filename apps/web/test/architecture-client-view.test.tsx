import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_ID } from "./support/architecture.tsx";
import {
  CLIENT_COMPONENTS,
  CLIENT_FLOW,
  CLIENT_FLOWS,
  renderClientArchitecture,
  serveClientArchitecture,
} from "./support/architecture-client.tsx";
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
/** TK-113 lot B, cas 6 : architecture validée vue du client et du business (maquette 13 l.132-137, 865, B581 à B582, B589). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const tabs = () => within(screen.getByRole("navigation", { name: "Sections de l'architecture" }));
const SPEC_READS = [
  "specArchitectureComponentsList",
  "specArchitectureDocument",
  "specArchitectureAdrList",
  "specArchitectureAdrById",
  "specArchitectureFlowsList",
  "specArchitectureSource",
  "specArchitectureZones",
] as const;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Architecture · vue client", () => {
  it("bandeau role=note « Lecture seule », statut, résumé et quatre onglets sans Document", async () => {
    serveClientArchitecture("client");
    renderClientArchitecture("tab=components");
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("Lecture seule.");
    expect(note).toHaveTextContent("poser vos questions en commentaire");
    expect(screen.getByText("Validé par l'équipe", { exact: true })).toBeVisible();
    expect(
      await screen.findByText("2 composants · 2 décisions · 1 flux · lecture seule"),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        tabs()
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(["Schéma", "Composants2", "Décisions2", "Flux1"]),
    );
    expect(tabs().queryByRole("link", { name: /Document|Relecture/ })).toBeNull();
  });

  it("aucun appel spec.architecture.* ; seul clientSpace est lu, jamais de YAML, chemin ni SHA à l'écran", async () => {
    serveClientArchitecture("client");
    renderClientArchitecture("tab=decisions");
    await screen.findByRole("article", { name: "Décision" });
    expect(await screen.findByRole("searchbox", { name: "Rechercher une décision" })).toBeVisible();
    for (const name of SPEC_READS) expect(procedures[name]).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/\.ya?ml|architecture\/adr|[0-9a-f]{40}/);
  });

  it("Décisions : « En clair » en tête, statut écrit, « Commenter » ; ni « Modifier » ni « Nouvelle décision »", async () => {
    serveClientArchitecture("client");
    renderClientArchitecture("tab=decisions");
    const fiche = within(await screen.findByRole("article", { name: "Décision" }));
    expect(await screen.findByRole("searchbox", { name: "Rechercher une décision" })).toBeVisible();
    expect(await fiche.findByText("En clair")).toBeVisible();
    expect(fiche.getByText("Un seul endroit s'occupe d'enregistrer les données.")).toBeVisible();
    expect(fiche.getByRole("button", { name: "Commenter" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Modifier|Nouvelle décision|Valider/ })).toBeNull();
  });

  it("« Commenter » une décision : dialogue nommé, comment.create adr, annonce, focus rendu au bouton", async () => {
    serveClientArchitecture("client");
    renderClientArchitecture("tab=decisions");
    const fiche = within(await screen.findByRole("article", { name: "Décision" }));
    expect(await screen.findByRole("searchbox", { name: "Rechercher une décision" })).toBeVisible();
    const opener = await fiche.findByRole("button", { name: "Commenter" });
    await userEvent.click(opener);
    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByRole("heading", {
        name: "Commenter la décision « Un seul composant écrit en base »",
      }),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByRole("textbox", { name: "Votre commentaire" }),
      "Pourquoi un seul ?",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Envoyer" }));
    await waitFor(() =>
      expect(procedures.commentCreate.mock.calls[0]?.[0]).toEqual({
        projectId: PROJECT_ID,
        targetKind: "adr",
        targetRef: "ADR-003",
        body: "Pourquoi un seul ?",
      }),
    );
    expect(await screen.findByText("Commentaire envoyé")).toBeInTheDocument();
  });

  it("Échap ferme le dialogue sans rien envoyer", async () => {
    serveClientArchitecture("client");
    renderClientArchitecture("tab=components");
    await userEvent.click(
      await screen
        .findByRole("button", { name: "Commenter API, C-api" })
        .catch(() => screen.findByRole("button", { name: "Commenter C-api, API" })),
    );
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(procedures.commentCreate).not.toHaveBeenCalled();
  });

  it("Composants : ce que fait le composant, sinon la phrase de l'équipe manquante ; commentaire de la cible composant", async () => {
    serveClientArchitecture("client");
    renderClientArchitecture("tab=components");
    const grid = within(await screen.findByRole("table", { name: "Composants de l'architecture" }));
    expect(grid.getByText("Gère les réservations et les créneaux.")).toBeVisible();
    expect(
      grid.getByText("L'équipe n'a pas encore rédigé le résumé de ce composant."),
    ).toBeVisible();
    await userEvent.click(grid.getByRole("button", { name: "Commenter C-db, Base de données" }));
    await userEvent.type(
      within(await screen.findByRole("dialog")).getByRole("textbox"),
      "Où sont les données ?",
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Envoyer" }),
    );
    await waitFor(() =>
      expect(procedures.commentCreate.mock.calls[0]?.[0]).toMatchObject({
        targetKind: "component",
        targetRef: "C-db",
      }),
    );
  });

  it("Flux : séquence lue, « Commenter » vise le flux (archflow)", async () => {
    serveClientArchitecture("client");
    renderClientArchitecture("tab=flows");
    expect(
      await screen.findByRole("img", { name: /Diagramme de séquence Réserver un rendez-vous/ }),
    ).toBeVisible();
    await userEvent.click(screen.getAllByRole("button", { name: "Commenter" })[0] as HTMLElement);
    await userEvent.type(
      within(await screen.findByRole("dialog")).getByRole("textbox"),
      "Et si le créneau est pris ?",
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Envoyer" }),
    );
    await waitFor(() =>
      expect(procedures.commentCreate.mock.calls[0]?.[0]).toMatchObject({
        targetKind: "archflow",
        targetRef: "P-reserver",
      }),
    );
  });

  it("Schéma : composants et liens du client ; la fiche montre « Sert » seul et le texte client", async () => {
    serveClientArchitecture("client");
    renderClientArchitecture("tab=schema&sel=C-api");
    expect(await screen.findByRole("button", { name: "Service API" })).toBeVisible();
    const fiche = within(
      await screen
        .findByRole("complementary", { name: "Fiche du composant" })
        .catch(() => screen.findByRole("dialog")),
    );
    expect(await fiche.findByText("Gère les réservations et les créneaux.")).toBeVisible();
    expect(fiche.getByText("F-001")).toBeVisible();
    expect(fiche.queryByRole("button", { name: /YAML|Mermaid/ })).toBeNull();
  });

  it("business : il lit, sans bouton « Commenter » ; le bandeau n'invite pas à commenter", async () => {
    serveClientArchitecture("business");
    renderClientArchitecture("tab=decisions");
    const fiche = within(await screen.findByRole("article", { name: "Décision" }));
    expect(await screen.findByRole("searchbox", { name: "Rechercher une décision" })).toBeVisible();
    await fiche.findByText("En clair");
    expect(screen.queryByRole("button", { name: /Commenter/ })).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("vous pouvez la lire.");
    expect(screen.getByRole("note")).not.toHaveTextContent("commentaire");
  });

  it("pas encore validée : message d'attente, aucun contenu, aucune décision ni flux lus", async () => {
    serveClientArchitecture("client", { available: false });
    renderClientArchitecture();
    expect(await screen.findByText("L'architecture n'est pas encore validée")).toBeVisible();
    expect(screen.queryByRole("note")).toBeNull();
    expect(procedures.clientSpaceAdrs).not.toHaveBeenCalled();
    expect(procedures.clientSpaceArchFlows).not.toHaveBeenCalled();
  });

  it("erreur de lecture : message et « Réessayer »", async () => {
    serveClientArchitecture("client");
    procedures.clientSpaceArchitecture.mockRejectedValue(new Error("boom"));
    renderClientArchitecture();
    expect(await screen.findByText("Impossible de charger l'architecture")).toBeVisible();
    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeVisible();
  });
});

/** TK-114i (B710, B714) : mêmes corrections pour la vue client (liste des flux, en-têtes du flux et de la fiche). */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Architecture · vue client : identifiant long (TK-114i)", () => {
  const specId = "P-consultation-de-la-transparence-sur-les-donnees";
  const title = "Consulter la transparence sur les données";
  const serveLongFlow = () => {
    serveClientArchitecture("client");
    procedures.clientSpaceArchFlows.mockResolvedValue({
      items: [{ ...CLIENT_FLOWS[0], specId, title }],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: 1,
      available: true,
      validation: "validated",
    });
    procedures.clientSpaceArchFlow.mockResolvedValue({ ...CLIENT_FLOW, specId, title });
    renderClientArchitecture("tab=flows");
  };
  const clipped = ["min-w-0", "max-w-full", "overflow-hidden"];

  it("liste : identifiant et titre complets au survol, ligne de 52 au minimum (A4)", async () => {
    serveLongFlow();
    const rows = within(await screen.findByRole("region", { name: "Flux de l'architecture" }));
    const tag = await rows.findByTitle(specId);
    expect(tag).toHaveClass(...clipped);
    expect(rows.getByTitle(title)).toHaveClass("truncate", "basis-28", "flex-1");
    expect(tag.parentElement).toContainElement(rows.getByTitle(title));
    const row = rows.getByRole("listitem");
    expect(row).toHaveClass("min-h-[52px]");
    expect(row).not.toHaveClass("h-[52px]");
  });

  it("détail du flux : identifiant tronqué, titre coupé partout, « Commenter » jamais rétréci", async () => {
    serveLongFlow();
    const heading = await screen.findByRole("heading", { level: 2, name: title });
    expect(heading).toHaveClass("min-w-0", "[overflow-wrap:anywhere]");
    const header = within(heading.parentElement as HTMLElement);
    expect(header.getByTitle(specId)).toHaveClass(...clipped);
    expect(header.getByRole("button", { name: "Commenter" })).toHaveClass("shrink-0");
  });

  it("fiche du composant : identifiant tronqué, type et « Commenter » jamais rétrécis", async () => {
    const id = "C-service-de-consultation-de-la-transparence";
    const name = "ServiceDeConsultationDeLaTransparenceSurLesDonnees";
    serveClientArchitecture("client");
    procedures.clientSpaceArchitecture.mockResolvedValue({
      available: true,
      validation: "validated",
      truncated: false,
      items: [{ ...CLIENT_COMPONENTS[0], id, name, dependsOn: [] }],
      positions: {},
    });
    renderClientArchitecture(`tab=schema&sel=${id}`);
    const heading = await screen.findByRole("heading", { level: 2, name });
    expect(heading).toHaveClass("[overflow-wrap:anywhere]");
    const fiche = within(heading.parentElement as HTMLElement);
    expect(fiche.getByTitle(id)).toHaveClass(...clipped);
    expect(fiche.getByRole("button", { name: "Commenter" })).toHaveClass("shrink-0");
    expect(fiche.getByText("Service", { selector: "[data-slot='pill']" })).toHaveClass("shrink-0");
  });
});
