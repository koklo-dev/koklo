import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  componentsFooterText,
  componentsResultText,
  decisionsText,
} from "../src/lib/architecture-labels.ts";
import { componentRow, renderArchitecture, serveArchitecture } from "./support/architecture.tsx";
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

/** TK-111 lot C, cas 7 : onglet Composants (recherche serveur, filtre de zone, pages de 50, pied de liste). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

describe("libellés de l'onglet Composants", () => {
  it("pied de liste et annonces de résultat", () => {
    expect(componentsFooterText(34, 34)).toBe("Fin de la liste · 34 composants");
    expect(componentsFooterText(1, 1)).toBe("Fin de la liste · 1 composant");
    expect(componentsFooterText(50, 120)).toBe(
      "Les 50 suivants se chargent automatiquement en approchant du bas.",
    );
    expect(componentsFooterText(100, 120)).toContain("Les 20 suivants");
    expect(componentsResultText({ q: "api", zone: undefined, total: 3, projectTotal: 34 })).toBe(
      "3 composants trouvés sur 34",
    );
    expect(componentsResultText({ q: "x", zone: undefined, total: 0, projectTotal: 34 })).toBe(
      "Aucun composant ne correspond à « x »",
    );
    expect(
      componentsResultText({ q: undefined, zone: "Paiement", total: 0, projectTotal: 3 }),
    ).toBe("Aucun composant dans cette zone.");
    expect(componentsResultText({ q: undefined, zone: undefined, total: 3, projectTotal: 3 })).toBe(
      "",
    );
    expect(decisionsText([])).toBe("—");
    expect(decisionsText(["ADR-001", "ADR-002"])).toBe("ADR-001, ADR-002");
  });
});

describe("Onglet Composants : recherche et zone", () => {
  it("la recherche s'écrit dans l'adresse après 200 ms et interroge le serveur sur tout l'index", async () => {
    serveArchitecture("owner");
    renderArchitecture();
    const field = await screen.findByRole("searchbox", { name: "Rechercher un composant" });
    expect(field).toHaveAttribute("placeholder", "Rechercher un composant ou C-…");
    await userEvent.type(field, "sms");
    await waitFor(() => expect(window.location.search).toBe("?q=sms"));
    const grid = await screen.findByRole("table", { name: "Composants de l'architecture" });
    await waitFor(() => expect(within(grid).getAllByRole("row")).toHaveLength(2));
    expect(within(grid).getByText("Fournisseur SMS")).toBeInTheDocument();
    expect(procedures.specArchitectureComponentsList.mock.calls.at(-1)?.[0]).toMatchObject({
      q: "sms",
    });
  });

  it("la recherche accepte un identifiant C-…", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "q=C-web" });
    const grid = await screen.findByRole("table", { name: "Composants de l'architecture" });
    await waitFor(() => expect(within(grid).getAllByRole("row")).toHaveLength(2));
    expect(within(grid).getByText("Application web")).toBeInTheDocument();
  });

  it("le filtre de zone liste les zones et leur compte, « Effacer le filtre » le retire", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "zone=Communication" });
    const grid = await screen.findByRole("table", { name: "Composants de l'architecture" });
    await waitFor(() => expect(within(grid).getAllByRole("row")).toHaveLength(2));
    await userEvent.click(screen.getByRole("button", { name: "Effacer le filtre" }));
    await waitFor(() => expect(window.location.search).toBe(""));
    await waitFor(() => expect(within(grid).getAllByRole("row")).toHaveLength(4));
  });

  it("zone sans composant : message dédié et « Effacer le filtre »", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "zone=Inconnue" });
    expect(await screen.findByText("Aucun composant dans cette zone.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Effacer le filtre" }).length).toBeGreaterThan(0);
  });
});

describe("Onglet Composants : pages de 50", () => {
  it("« Charger la suite » ajoute la page suivante, le pied devient « Fin de la liste · 70 composants »", async () => {
    const rows = Array.from({ length: 70 }, (_, i) => componentRow(i + 1));
    serveArchitecture("owner", { rows });
    renderArchitecture();
    const grid = await screen.findByRole("table", { name: "Composants de l'architecture" });
    expect(within(grid).getAllByRole("row")).toHaveLength(51);
    await userEvent.click(await screen.findByRole("button", { name: /suivants|Charger/ }));
    await waitFor(() => expect(within(grid).getAllByRole("row")).toHaveLength(71));
    expect(screen.getByText("Fin de la liste · 70 composants")).toBeInTheDocument();
  });
});
