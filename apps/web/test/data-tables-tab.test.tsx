import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderData, serveData, serveTables, tableRow } from "./support/data.tsx";
import { inputsOf } from "./support/features.tsx";
import {
  apiError,
  polyfillRadix,
  procedures,
  resetWebMocks,
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

/** TK-107 lot C, critères 14 et 22 : onglet Tables (colonnes, recherche, pied, zone, lien direct, volume de 80 tables). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const grid = () => screen.findByRole("table", { name: "Tables du modèle de données" });
const many = (n: number) => Array.from({ length: n }, (_, i) => tableRow(i + 1));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Tables", () => {
  it("colonnes de la maquette : Table, Zone, Champs, Relations, Utilisée par, Données personnelles", async () => {
    serveData("owner");
    renderData({ search: "tab=tables" });
    const table = await grid();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Table", "Zone", "Champs", "Relations", "Utilisée par", "Données personnelles"]);
  });

  it("une ligne par table : identifiant et nom, zone, compteurs, « Utilisée par », pastille de données personnelles", async () => {
    serveData("owner");
    renderData({ search: "tab=tables" });
    const row = (await screen.findByRole("rowheader", { name: /T-client/ })).closest(
      "tr",
    ) as HTMLElement;
    expect(within(row).getByText("T-client")).toBeInTheDocument();
    expect(within(row).getByText("Clients et fidélité")).toBeInTheDocument();
    expect(within(row).getByText("F-001, R-004")).toBeInTheDocument();
    expect(within(row).getByText("Oui · NFR-001")).toBeInTheDocument();
    const other = screen
      .getByRole("rowheader", { name: /T-reservation/ })
      .closest("tr") as HTMLElement;
    expect(within(other).getByText("Non")).toBeInTheDocument();
    expect(within(other).getAllByRole("cell")[2]?.textContent).toBe("3");
  });

  it("note RGPD, barre de compte et pied de fin de liste", async () => {
    serveData("owner");
    renderData({ search: "tab=tables" });
    await grid();
    expect(
      screen.getByText(/reliés à l'exigence NFR-001 \(RGPD\) du cahier technique/),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-total]")?.textContent).toBe("3");
    expect(screen.getByText(/Fin de la liste/)).toBeInTheDocument();
  });

  it("la région défilante du tableau est focusable et nommée (375 px)", async () => {
    serveData("owner");
    renderData({ search: "tab=tables" });
    const region = await screen.findByRole("region", { name: "Tables du modèle de données" });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("recherche : la saisie écrit ?q= après le délai et relit la liste sur tout le projet", async () => {
    serveData("owner");
    renderData({ search: "tab=tables" });
    await grid();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Rechercher une table ou un champ" }),
      "cli",
    );
    await waitFor(() => expect(window.location.search).toContain("q=cli"));
    await waitFor(() =>
      expect(inputsOf(procedures.specDataTablesList).some((i) => i.q === "cli")).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText("Réservation")).toBeNull());
    expect(screen.getByText("Client")).toBeInTheDocument();
  });

  it("recherche vide : « Aucune table ne correspond à « x » » et « Effacer la recherche »", async () => {
    serveData("owner");
    renderData({ search: "tab=tables&q=zzz" });
    expect(await screen.findByText("Aucune table ne correspond à « zzz »")).toBeInTheDocument();
    expect(screen.getByText(/porte sur toutes les tables et sur leurs champs/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
    await waitFor(() => expect(window.location.search).not.toContain("q="));
    await grid();
  });

  it("filtre de zone : le choix relance la liste avec la zone et « Effacer le filtre » la retire", async () => {
    serveData("owner");
    renderData({ search: "tab=tables" });
    await grid();
    await userEvent.click(screen.getByRole("button", { name: "Zone" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: /Catalogue et stock/ }));
    await waitFor(() => expect(window.location.search).toContain("zone=Catalogue"));
    await waitFor(() =>
      expect(
        inputsOf(procedures.specDataTablesList).some((i) => i.zone === "Catalogue et stock"),
      ).toBe(true),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Effacer le filtre" }));
    await waitFor(() => expect(window.location.search).not.toContain("zone="));
  });

  it("erreur de lecture : avis et « Réessayer », sans tableau", async () => {
    serveData("owner");
    serveTables({ fail: apiError("INTERNAL") });
    renderData({ search: "tab=tables" });
    expect(
      await screen.findByText("Impossible de charger le modèle de données"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("« / » met le focus sur la recherche", async () => {
    serveData("owner");
    renderData({ search: "tab=tables" });
    await grid();
    await userEvent.keyboard("/");
    expect(
      screen.getByRole("searchbox", { name: "Rechercher une table ou un champ" }),
    ).toHaveFocus();
  });

  it("propriétaire : le nom ouvre le formulaire de modification ; designer : le nom n'est pas un bouton", async () => {
    serveData("owner");
    const { unmount } = renderData({ search: "tab=tables" });
    await userEvent.click(await screen.findByRole("button", { name: "Modifier T-client, Client" }));
    await waitFor(() => expect(window.location.search).toContain("edit=T-client"));
    unmount();
    resetWebMocks();
    serveData("designer");
    renderData({ search: "tab=tables" });
    await grid();
    expect(screen.queryByRole("button", { name: /^Modifier T-/ })).toBeNull();
  });
});

describe("Onglet Tables : 80 tables (stub large)", () => {
  it("première page de 50 : « 80 tables · 50 chargées » et la suite se charge au clic", async () => {
    serveData("owner", { rows: many(80) });
    renderData({ search: "tab=tables" });
    await grid();
    expect(await screen.findByText(/50 chargées/)).toBeInTheDocument();
    expect(screen.getAllByRole("rowheader")).toHaveLength(50);
    expect(inputsOf(procedures.specDataTablesList)[0]).toMatchObject({ limit: 50 });
    await userEvent.click(await screen.findByRole("button", { name: /Charger/ }));
    await waitFor(() => expect(screen.getAllByRole("rowheader")).toHaveLength(80));
    expect(screen.getByText(/Fin de la liste/)).toBeInTheDocument();
  });

  it("lien direct ?sel=T-table-070 : la page qui la contient s'ouvre, la ligne est repérée", async () => {
    serveData("owner", { rows: many(80) });
    renderData({ search: "tab=tables&sel=T-table-070" });
    const row = (await screen.findByRole("rowheader", { name: /T-table-070/ })).closest("tr");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(inputsOf(procedures.specDataTablesList).some((i) => i.around === "T-table-070")).toBe(
      true,
    );
  });

  it("recherche sur des tables non chargées : le serveur répond sur les 80", async () => {
    serveData("owner", { rows: many(80) });
    renderData({ search: "tab=tables&q=Table 075" });
    expect(await screen.findByRole("rowheader", { name: /T-table-075/ })).toBeInTheDocument();
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
  });

  it("une sélection inconnue (NOT_FOUND) est abandonnée et la liste s'affiche quand même", async () => {
    serveData("owner", { rows: many(5) });
    renderData({ search: "tab=tables&sel=T-absente" });
    expect(await screen.findAllByRole("rowheader")).toHaveLength(5);
  });
});
