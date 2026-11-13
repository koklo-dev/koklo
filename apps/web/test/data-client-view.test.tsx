import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_ID, renderData } from "./support/data.tsx";
import { serveClientData } from "./support/data-client.tsx";
import { polyfillRadix, procedures, resetWebMocks, watchUrl } from "./support/web-mocks.ts";
import { DESKTOP, setViewport } from "./viewport.ts";

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

/** TK-109 lot C, critère 8 : la vue client des Données (maquette 11 l.160-167, 168-261, 596). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  setViewport(DESKTOP);
  window.localStorage.clear();
});

const heading = () => screen.findByRole("heading", { level: 1, name: "Modèle de données" });
const card = async (name: string) =>
  within(await screen.findByRole("region", { name: "Diagramme entité-relation" })).findByRole(
    "button",
    { name: new RegExp(`^Table ${name},`) },
  );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Vue client des Données : en-tête et bandeau", () => {
  it("client : statut « Validé par l'équipe », résumé « 3 tables · lecture seule », bouton « Commenter »", async () => {
    serveClientData("client");
    renderData();
    await heading();
    expect(await screen.findByText("Validé par l'équipe")).toBeInTheDocument();
    expect(screen.getByText("3 tables · lecture seule")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commenter" })).toBeInTheDocument();
    expect(procedures.clientSpaceDataModel).toHaveBeenCalledWith({ projectId: PROJECT_ID });
  });

  it("bandeau « Lecture seule » en role=note, avec l'invitation à commenter", async () => {
    serveClientData("client");
    renderData();
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("Lecture seule.");
    expect(note).toHaveTextContent("Vous pouvez le lire et commenter");
    expect(note).toHaveAttribute("data-variant", "readonly");
  });

  it("onglets Diagramme, Tables et Jeux d'exemple, sans Relecture", async () => {
    serveClientData("client");
    renderData();
    const nav = await screen.findByRole("navigation", { name: "Sections du modèle de données" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      expect.stringContaining("Diagramme"),
      expect.stringContaining("Tables"),
      expect.stringContaining("Jeux d'exemple"),
    ]);
  });

  it("aucune lecture réservée à l'équipe, une seule région d'état", async () => {
    serveClientData("client");
    renderData();
    await heading();
    await screen.findByRole("region", { name: "Diagramme entité-relation" });
    expect(procedures.specDataMermaid).not.toHaveBeenCalled();
    expect(procedures.specDataTablesList).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Modifier|Ajouter une table|Valider/ })).toBeNull();
    // Le lecteur annonce son zoom dans sa propre région ; la page n'en porte qu'une.
    const pageStatus = screen
      .getAllByRole("status")
      .filter((region) => !region.closest("[data-slot='diagram-viewer']"));
    expect(pageStatus).toHaveLength(1);
  });

  it("business : lit sans « Commenter », le bandeau ne parle plus de commenter", async () => {
    serveClientData("business");
    renderData();
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("Lecture seule.");
    expect(note).not.toHaveTextContent("commenter");
    await screen.findByRole("region", { name: "Diagramme entité-relation" });
    expect(screen.queryByRole("button", { name: "Commenter" })).toBeNull();
  });
});

describe("Vue client des Données : onglets", () => {
  it("Diagramme : la fiche d'une table dit « Ce qu'on enregistre », ses relations et « Utilisée par »", async () => {
    serveClientData("client");
    renderData();
    await userEvent.click(await card("Client"));
    const fiche = await screen.findByRole("complementary", { name: "Fiche de la table" });
    expect(within(fiche).getByRole("heading", { level: 2, name: "Client" })).toBeInTheDocument();
    expect(within(fiche).getByText("Le nom du client")).toBeInTheDocument();
    expect(within(fiche).getByText("Utilisée par")).toBeInTheDocument();
    expect(within(fiche).queryByRole("button", { name: "Modifier" })).toBeNull();
    expect(within(fiche).queryByRole("button", { name: /YAML|Mermaid/ })).toBeNull();
    expect(within(fiche).queryByText("Contraintes")).toBeNull();
    expect(within(fiche).getByRole("button", { name: "Commenter" })).toBeInTheDocument();
  });

  it("Tables : le même tableau, sans bouton d'écriture", async () => {
    serveClientData("client");
    renderData({ search: "tab=tables" });
    const grid = await screen.findByRole("table", { name: "Tables du modèle de données" });
    expect(within(grid).getAllByRole("row")).toHaveLength(4);
    expect(within(grid).getByText("Clients et fidélité")).toBeInTheDocument();
    expect(within(grid).getByText("Oui · NFR-001")).toBeInTheDocument();
    expect(within(grid).queryByRole("button", { name: /^Modifier/ })).toBeNull();
  });

  it("Tables : « Voir la fiche » ouvre la table dans le diagramme", async () => {
    serveClientData("client");
    renderData({ search: "tab=tables" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Voir la fiche de T-client, Client" }),
    );
    await waitFor(() => expect(window.location.search).toContain("sel=T-client"));
    expect(window.location.search).toContain("tab=diagram");
  });

  it("Jeux d'exemple : une section par jeu, les lignes viennent de la lecture client", async () => {
    serveClientData("client");
    renderData({ search: "tab=fixtures" });
    const section = await screen.findByRole("region", { name: "Jeu d'exemple Clients" });
    expect(await within(section).findByText("Moussa")).toBeInTheDocument();
    expect(procedures.clientSpaceDataFixtureRows).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      fixtureId: "FX-clients",
      page: 1,
      size: 25,
    });
    expect(procedures.specDataFixturesRows).not.toHaveBeenCalled();
  });
});

describe("Vue client des Données : états", () => {
  it("non validé : état vide « pas encore validé », aucune table lue ni bouton « Commenter »", async () => {
    serveClientData("client", { available: false });
    renderData();
    expect(
      await screen.findByText("Le modèle de données n'est pas encore validé"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByRole("button", { name: "Commenter" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Diagramme entité-relation" })).toBeNull();
  });

  it("erreur de lecture : message et « Réessayer » relit le modèle", async () => {
    serveClientData("client");
    procedures.clientSpaceDataModel.mockRejectedValueOnce(new Error("boom"));
    renderData();
    expect(
      await screen.findByText("Impossible de charger le modèle de données"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("note")).toBeInTheDocument();
  });
});

describe("Vue client des Données : commenter", () => {
  it("« Commenter » depuis la fiche : envoi sur la table, annonce « Commentaire envoyé », dialogue fermé", async () => {
    serveClientData("client");
    renderData();
    await userEvent.click(await card("Client"));
    const fiche = await screen.findByRole("complementary", { name: "Fiche de la table" });
    await userEvent.click(within(fiche).getByRole("button", { name: "Commenter" }));
    const dialog = await screen.findByRole("dialog", { name: /Commenter la table/ });
    await userEvent.type(within(dialog).getByRole("textbox"), "Il manque le prénom");
    await userEvent.click(within(dialog).getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(procedures.commentCreate).toHaveBeenCalled());
    expect(procedures.commentCreate.mock.calls[0]?.[0]).toEqual({
      projectId: PROJECT_ID,
      targetKind: "table",
      targetRef: "T-client",
      body: "Il manque le prénom",
    });
    expect(await screen.findByText("Commentaire envoyé")).toHaveAttribute("role", "status");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("« Commenter » de l'en-tête vise la table choisie, sinon la première", async () => {
    serveClientData("client");
    renderData();
    await heading();
    const header = (await screen.findAllByRole("button", { name: "Commenter" }))[0] as HTMLElement;
    await userEvent.click(header);
    expect(
      await screen.findByRole("dialog", { name: /Commenter la table « Client »/ }),
    ).toBeInTheDocument();
  });
});
