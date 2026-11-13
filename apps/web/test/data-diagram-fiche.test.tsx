import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL, renderData, serveData, TABLE_YAML } from "./support/data.tsx";
import { fake, serveProposals } from "./support/proposals.tsx";
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

/** TK-108 lot C : la fiche ancrée de l'onglet Diagramme, ses trois vues Fiche, YAML et Mermaid (B423, B424, B426, B427). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  setViewport(DESKTOP);
  window.localStorage.clear();
});

const pickTable = async (name: string) => {
  const region = await screen.findByRole("region", { name: "Diagramme entité-relation" });
  const button = await within(region).findByRole("button", { name: new RegExp(`^Table ${name},`) });
  await userEvent.click(button);
  return screen.findByRole("complementary", { name: "Fiche de la table" });
};
const view = (fiche: HTMLElement, name: string) =>
  userEvent.click(within(fiche).getByRole("button", { name }));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Fiche : vue Fiche", () => {
  it("identifiant, nom, « Modifier », sélecteur Fiche · YAML · Mermaid et description", async () => {
    serveData("owner");
    renderData();
    const fiche = await pickTable("Client");
    expect(within(fiche).getByText("T-client")).toBeInTheDocument();
    expect(within(fiche).getByRole("heading", { level: 2, name: "Client" })).toBeInTheDocument();
    expect(within(fiche).getByRole("button", { name: "Modifier" })).toBeInTheDocument();
    const group = within(fiche).getByRole("group", { name: "Affichage de la table" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Fiche", "YAML", "Mermaid"]);
    expect(within(group).getByRole("button", { name: "Fiche" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await within(fiche).findByText("Une personne qui réserve.")).toBeInTheDocument();
  });

  it("champs en tableau avec contraintes et données personnelles", async () => {
    serveData("owner");
    renderData();
    const fiche = await pickTable("Client");
    const fields = await within(fiche).findByRole("table", { name: "Champs de la table" });
    expect(
      within(fields)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Champ", "Type", "Contraintes"]);
    expect(within(fields).getByRole("row", { name: /nom texte\(80\) obligatoire/ })).toBeVisible();
    expect(
      within(fields).getByRole("row", { name: /telephone .*données personnelles/ }),
    ).toBeVisible();
  });

  it("relations dans les deux sens, écrites « cardinalité Source → Cible », sans phrase inventée", async () => {
    serveData("owner");
    renderData();
    const client = await pickTable("Client");
    expect(within(client).getByText("Relations")).toBeInTheDocument();
    expect(within(client).getByText("n → 1")).toBeInTheDocument();
    expect(within(client).getByText("Réservation → Client")).toBeInTheDocument();
    const region = await screen.findByRole("region", { name: "Diagramme entité-relation" });
    await userEvent.click(within(region).getByRole("button", { name: /^Table Service,/ }));
    expect(await screen.findByText("Aucune relation")).toBeInTheDocument();
  });

  it("« Utilisée par » : une pastille par fonctionnalité ou règle citée", async () => {
    serveData("owner");
    renderData();
    const fiche = await pickTable("Client");
    expect(within(fiche).getByText("Utilisée par")).toBeInTheDocument();
    expect(await within(fiche).findByText("F-001")).toBeInTheDocument();
    expect(within(fiche).getByText("R-004")).toBeInTheDocument();
  });

  it("« Modifier » ouvre le formulaire de la table", async () => {
    serveData("owner");
    renderData();
    const fiche = await pickTable("Client");
    await userEvent.click(within(fiche).getByRole("button", { name: "Modifier" }));
    await waitFor(() => expect(window.location.search).toContain("edit=T-client"));
  });
});

describe("Fiche : YAML et Mermaid", () => {
  it("YAML : le fichier de la table dans un pre, « Source de vérité », texte brut", async () => {
    serveData("owner");
    renderData();
    const fiche = await pickTable("Client");
    await view(fiche, "YAML");
    const code = await within(fiche).findByText(
      (_, el) => el?.tagName === "PRE" && el.textContent === TABLE_YAML,
    );
    expect(code.tagName).toBe("PRE");
    expect(within(fiche).getByText("data/tables/client.yaml")).toBeInTheDocument();
    expect(within(fiche).getByText("Source de vérité")).toBeInTheDocument();
    expect(
      within(fiche).getByText(/Un fichier par table : c'est ce que l'agent lit et modifie/),
    ).toBeInTheDocument();
    expect(within(fiche).getByRole("button", { name: "YAML" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("YAML généré (fichier absent du dépôt) : pastille « Généré »", async () => {
    serveData("owner");
    procedures.specDataTablesSource.mockResolvedValue({
      path: "data/tables/client.yaml",
      text: TABLE_YAML,
      commitSha: "a".repeat(40),
      generated: true,
    });
    renderData();
    const fiche = await pickTable("Client");
    await view(fiche, "YAML");
    expect(await within(fiche).findByText("Généré")).toBeInTheDocument();
    expect(within(fiche).queryByText("Source de vérité")).toBeNull();
  });

  it("Mermaid : data/model.mmd entier, « Généré », Copier envoie le texte et dit « Copié »", async () => {
    serveData("owner");
    const user = userEvent.setup();
    renderData();
    const region = await screen.findByRole("region", { name: "Diagramme entité-relation" });
    await user.click(await within(region).findByRole("button", { name: /^Table Client,/ }));
    const fiche = await screen.findByRole("complementary", { name: "Fiche de la table" });
    await user.click(within(fiche).getByRole("button", { name: "Mermaid" }));
    const code = await within(fiche).findByText(
      (_, el) => el?.tagName === "PRE" && el.textContent === MODEL,
    );
    expect(code).toBeInTheDocument();
    expect(within(fiche).getByText("data/model.mmd")).toBeInTheDocument();
    expect(within(fiche).getByText("Généré")).toBeInTheDocument();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(within(fiche).getByRole("button", { name: "Copier" }));
    expect(write).toHaveBeenCalledWith(MODEL);
    expect(await screen.findByText("Copié")).toBeInTheDocument();
  });
});

describe("Fiche : droits et propositions", () => {
  it("designer : il lit la fiche et le YAML, sans « Modifier »", async () => {
    serveData("designer");
    renderData();
    const fiche = await pickTable("Client");
    expect(within(fiche).queryByRole("button", { name: "Modifier" })).toBeNull();
    await view(fiche, "YAML");
    expect(await within(fiche).findByText("Source de vérité")).toBeInTheDocument();
  });

  it("table proposée : champs seulement, ni sélecteur Fiche · YAML · Mermaid ni « Modifier »", async () => {
    serveData("owner");
    serveProposals([
      fake(1, {
        kind: "table",
        zone: "Prise de rendez-vous",
        title: "Avis",
        content: {
          name: "Avis",
          sources: ["F-001"],
          fields: [
            { name: "id", type: "uuid", primaryKey: true },
            { name: "note", type: "entier" },
          ],
        },
      }),
    ]);
    renderData({ search: "view=review&tab=diagram" });
    const fiche = await pickTable("Avis");
    expect(within(fiche).getByRole("heading", { level: 2, name: "Avis" })).toBeInTheDocument();
    expect(within(fiche).queryByRole("group", { name: "Affichage de la table" })).toBeNull();
    expect(within(fiche).queryByRole("button", { name: "Modifier" })).toBeNull();
    expect(within(fiche).getByRole("table", { name: "Champs de la table" })).toBeInTheDocument();
    expect(procedures.specDataTablesSource).not.toHaveBeenCalled();
  });
});

describe("Fiche : panneau superposé sous 1280 px", () => {
  it("devient une feuille à droite ; Échap la ferme et rend le focus à la carte", async () => {
    setViewport(1100);
    serveData("owner");
    renderData();
    const region = await screen.findByRole("region", { name: "Diagramme entité-relation" });
    const button = await within(region).findByRole("button", { name: /^Table Client,/ });
    await userEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Fiche de la table" });
    expect(within(dialog).getByRole("heading", { level: 2, name: "Client" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Fiche de la table" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
  });
});
