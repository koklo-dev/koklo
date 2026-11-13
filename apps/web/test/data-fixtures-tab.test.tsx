import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderData, serveData } from "./support/data.tsx";
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

/** TK-107 lot C, critère 15 : onglet Jeux d'exemple (sections, lignes fictives, pagination de 25). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const section = () => screen.findByRole("region", { name: "Jeu d'exemple Clients" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Jeux d'exemple", () => {
  it("phrase d'aide, une section par jeu avec son identifiant, son titre et sa méta", async () => {
    serveData("owner");
    renderData({ search: "tab=fixtures" });
    const box = await section();
    expect(
      screen.getByText(
        /Données fictives, typées d'après les tables\. Elles alimentent les maquettes d'écrans/,
      ),
    ).toBeInTheDocument();
    expect(within(box).getByText("FX-clients")).toBeInTheDocument();
    expect(within(box).getByRole("heading", { level: 3, name: "Clients" })).toBeInTheDocument();
    expect(within(box).getByText("60 lignes · T-client · locale fr-FR")).toBeInTheDocument();
  });

  it("colonnes du jeu en tête, 25 premières lignes fictives, e-mails à domaine réservé", async () => {
    serveData("owner");
    renderData({ search: "tab=fixtures" });
    const box = await section();
    const grid = await within(box).findByRole("table", { name: "Lignes du jeu Clients" });
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["nom", "telephone", "email"]);
    expect(within(grid).getAllByRole("row")).toHaveLength(26);
    expect(within(grid).getByText("client1@exemple.fr")).toBeInTheDocument();
    expect(inputsOf(procedures.specDataFixturesRows)[0]).toMatchObject({
      fixtureId: "FX-clients",
      page: 1,
      size: 25,
    });
  });

  it("pagination numérotée : « 1–25 sur 60 », 25 lignes par page, page suivante lit la page 2", async () => {
    serveData("owner");
    renderData({ search: "tab=fixtures" });
    const box = await section();
    const nav = within(box).getByRole("navigation", { name: "Pagination du jeu Clients" });
    expect(within(nav).getByText(/1.25 sur 60/)).toBeInTheDocument();
    expect(within(nav).getByText("25 lignes par page")).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Page précédente" })).toBeDisabled();
    await userEvent.click(within(nav).getByRole("button", { name: "Page suivante" }));
    expect(await within(box).findByText("client26@exemple.fr")).toBeInTheDocument();
    expect(within(nav).getByText(/26.50 sur 60/)).toBeInTheDocument();
    expect(inputsOf(procedures.specDataFixturesRows).some((i) => i.page === 2)).toBe(true);
    await userEvent.click(within(nav).getByRole("button", { name: "Page 3" }));
    await waitFor(() => expect(within(nav).getByText(/51.60 sur 60/)).toBeInTheDocument());
    expect(within(nav).getByRole("button", { name: "Page suivante" })).toBeDisabled();
  });

  it("aucun jeu : état vide sans action", async () => {
    serveData("owner");
    procedures.specDataFixturesList.mockResolvedValue({ items: [] });
    renderData({ search: "tab=fixtures" });
    expect(await screen.findByText("Aucun jeu d'exemple")).toBeInTheDocument();
  });

  it("erreur de lecture des jeux : avis et « Réessayer »", async () => {
    serveData("owner");
    procedures.specDataFixturesList.mockRejectedValue(apiError("INTERNAL"));
    renderData({ search: "tab=fixtures" });
    expect(await screen.findByText("Impossible de charger les jeux d'exemple")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("le designer lit les jeux d'exemple", async () => {
    serveData("designer");
    renderData({ search: "tab=fixtures" });
    expect(await section()).toBeInTheDocument();
  });
});
