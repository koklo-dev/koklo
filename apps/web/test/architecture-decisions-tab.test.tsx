import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADR_ROWS,
  renderArchitecture,
  serveArchitecture,
  serveDecisions,
} from "./support/architecture.tsx";
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

/** TK-113 lot B, cas 1 et 2 : onglet Décisions (maquette 13 l.376-401) : liste, compte, filtres dans l'adresse, fiche. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const list = () => screen.findByRole("region", { name: "Décisions de l'architecture" });
const many = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    ...ADR_ROWS[0],
    specId: `ADR-${String(count - index).padStart(3, "0")}`,
    title: `Décision numéro ${count - index}`,
  })) as typeof ADR_ROWS;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Décisions", () => {
  it("liste les décisions avec statut écrit, date et liens ; la première s'ouvre en fiche", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=decisions" });
    const rows = within(await list());
    expect(rows.getByText("ADR-003")).toBeVisible();
    expect(rows.getByText("Un seul composant écrit en base")).toBeVisible();
    expect(rows.getByText("Acceptée")).toBeVisible();
    expect(rows.getByText("Proposée")).toBeVisible();
    expect(rows.getByText("Remplacée")).toBeVisible();
    expect(rows.getByText("3 oct. · C-api, C-db")).toBeVisible();
    expect(await screen.findByRole("article", { name: "Décision" })).toBeVisible();
    // « En clair » n'existe qu'en vue client (maquette 13 l.392).
    expect(screen.queryByText("En clair")).toBeNull();
  });

  it("la barre de compte donne le total et la répartition par statut ; l'en-tête compte les décisions", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=decisions" });
    await list();
    expect(await screen.findByText(/1 acceptée · 1 proposée/)).toBeVisible();
    expect(screen.queryByText(/remplacée ·|toutes chargées/)).toBeNull();
    expect(screen.getByText("3 composants · 3 décisions · 2 flux")).toBeVisible();
    expect(screen.getByRole("link", { name: /Décisions3/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("le filtre d'adresse (?status=) part au serveur", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=decisions&status=proposee&component=C-sms&period=30j" });
    await waitFor(() =>
      expect(procedures.specArchitectureAdrList).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "proposee",
          component: "C-sms",
          from: expect.any(String),
        }),
      ),
    );
    expect(within(await list()).getByText("Fournisseur SMS derrière une interface")).toBeVisible();
    expect(screen.getByRole("button", { name: "Effacer les filtres" })).toBeVisible();
  });

  it("choisir un statut l'écrit dans l'adresse", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=decisions" });
    await list();
    await userEvent.click(screen.getByRole("button", { name: "Statut" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: /Proposée/ }));
    await waitFor(() => expect(window.location.search).toContain("status=proposee"));
  });

  it("la recherche attend 200 ms avant la requête, puis s'écrit dans l'adresse (?q=)", async () => {
    serveArchitecture("owner");
    renderArchitecture({ search: "tab=decisions" });
    await list();
    const before = procedures.specArchitectureAdrList.mock.calls.length;
    await userEvent.type(screen.getByRole("searchbox", { name: "Rechercher une décision" }), "SMS");
    expect(procedures.specArchitectureAdrList.mock.calls.length).toBe(before);
    await waitFor(() => expect(window.location.search).toContain("q=SMS"));
    await waitFor(() =>
      expect(procedures.specArchitectureAdrList).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "SMS" }),
      ),
    );
  });

  it("50 par page, « Charger la suite » ajoute les 50 suivantes", async () => {
    serveArchitecture("owner");
    serveDecisions(many(120));
    renderArchitecture({ search: "tab=decisions" });
    const rows = within(await list());
    await waitFor(() => expect(rows.getAllByRole("button")).toHaveLength(50));
    await userEvent.click(await screen.findByRole("button", { name: "Charger la suite" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "Décisions de l'architecture" })).getAllByRole(
          "button",
        ),
      ).toHaveLength(100),
    );
  });

  it("lien direct ?d= hors de la première page : la page qui la contient est chargée", async () => {
    serveArchitecture("owner");
    serveDecisions(many(120));
    renderArchitecture({ search: "tab=decisions&d=ADR-010" });
    await waitFor(() =>
      expect(procedures.specArchitectureAdrList).toHaveBeenCalledWith(
        expect.objectContaining({ around: "ADR-010" }),
      ),
    );
    expect(await screen.findByRole("button", { name: /ADR-010/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("aucune décision : état vide ; filtre sans résultat : « Effacer les filtres »", async () => {
    serveArchitecture("owner");
    serveDecisions([]);
    renderArchitecture({ search: "tab=decisions" });
    expect(await screen.findByText("Aucune décision")).toBeVisible();
    serveDecisions([]);
    renderArchitecture({ search: "tab=decisions&status=proposee" });
    expect(await screen.findByText("Aucune décision pour ce filtre.")).toBeVisible();
  });

  it("erreur de lecture : message et « Réessayer »", async () => {
    serveArchitecture("owner");
    procedures.specArchitectureAdrList.mockRejectedValue(new Error("boom"));
    renderArchitecture({ search: "tab=decisions" });
    expect(await screen.findByText("Impossible de charger les décisions")).toBeVisible();
    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeVisible();
  });

  it("designer : lit sans « Modifier » ni « Nouvelle décision »", async () => {
    serveArchitecture("designer");
    renderArchitecture({ search: "tab=decisions" });
    await list();
    await screen.findByRole("article", { name: "Décision" });
    expect(screen.queryByRole("button", { name: /Modifier|Nouvelle décision/ })).toBeNull();
  });
});
