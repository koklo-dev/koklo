import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLOW,
  feature,
  progress,
  RULE,
  renderClient,
  serveClient,
} from "./support/client-space.tsx";
import { inputsOf } from "./support/features.tsx";
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

/** TK-105 lot B (B364) : la recherche de la vue client est faite par le serveur, jamais sur les seules lignes chargées. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  serveClient();
});

const OTHER_RULE = { ...RULE, id: "R-250", title: "Délai d'annulation" };
const rulesPage = (items: unknown[], total = items.length) => ({
  items,
  nextCursor: null,
  previousCursor: null,
  offset: 0,
  total,
  validation: "to_validate",
  previouslyValidated: false,
  version: "v-rules",
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Vue client : recherche serveur", () => {
  it("règles : « R-0 » appelle clientSpace.rules avec q, après anti-rebond, et affiche la réponse du serveur", async () => {
    procedures.clientSpaceRules.mockImplementation(async (input) =>
      (input as { q?: string }).q ? rulesPage([OTHER_RULE], 86) : rulesPage([RULE], 86),
    );
    renderClient("?tab=rules");
    const search = await screen.findByRole("searchbox", { name: "Rechercher une règle ou R-nnn" });
    await userEvent.type(search, "R-0");
    await waitFor(() =>
      expect(inputsOf(procedures.clientSpaceRules).some((input) => input.q === "R-0")).toBe(true),
    );
    // Les frappes intermédiaires n'ont pas chacune produit une requête.
    expect(inputsOf(procedures.clientSpaceRules).filter((input) => input.q).length).toBe(1);
    expect(await screen.findByText(OTHER_RULE.title)).toBeInTheDocument();
    expect(screen.queryByText(RULE.title)).toBeNull();
  });

  it("règles : un type de la légende part au serveur (type), pas un filtre local", async () => {
    renderClient("?tab=rules");
    await screen.findByText(RULE.title);
    await userEvent.click(screen.getAllByRole("button", { name: "Calcul" })[0] as HTMLElement);
    await waitFor(() =>
      expect(inputsOf(procedures.clientSpaceRules).some((input) => input.type === "calcul")).toBe(
        true,
      ),
    );
  });

  it("règles : aucun résultat, « Aucune règle ne correspond à « x » », la recherche reste utilisable", async () => {
    procedures.clientSpaceRules.mockImplementation(async (input) =>
      (input as { q?: string }).q ? rulesPage([], 0) : rulesPage([RULE], 86),
    );
    renderClient("?tab=rules");
    await userEvent.type(
      await screen.findByRole("searchbox", { name: "Rechercher une règle ou R-nnn" }),
      "zzz",
    );
    expect(await screen.findByText("Aucune règle ne correspond à « zzz »")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Rechercher une règle ou R-nnn" })).toHaveValue(
      "zzz",
    );
    expect(
      screen.getByText("La recherche porte sur toutes les règles, pas seulement celles affichées."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Fin de la liste/)).toBeNull();
    expect(screen.getByRole("button", { name: "Effacer la recherche" })).toBeInTheDocument();
  });

  it("règles : le compte dit « total · N chargées » avec les 24 premières d'un total de 86", async () => {
    procedures.clientSpaceRules.mockResolvedValue({
      ...rulesPage(
        Array.from({ length: 24 }, (_, i) => ({
          ...RULE,
          id: `R-${String(i + 1).padStart(3, "0")}`,
        })),
        86,
      ),
      nextCursor: "c2",
    });
    renderClient("?tab=rules");
    await screen.findByText("R-024");
    expect(screen.getAllByText(/24 chargées/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/86/)[0]).toBeInTheDocument();
  });

  it("parcours : la recherche appelle clientSpace.flows avec q", async () => {
    procedures.clientSpaceFlows.mockImplementation(async (input) => ({
      items: (input as { q?: string }).q ? [] : [FLOW],
      nextCursor: null,
      previousCursor: null,
      offset: 0,
      total: (input as { q?: string }).q ? 0 : 18,
      version: "v-flows",
    }));
    renderClient("?tab=flows");
    await userEvent.type(
      await screen.findByRole("searchbox", { name: "Rechercher un parcours" }),
      "zzz",
    );
    await waitFor(() =>
      expect(inputsOf(procedures.clientSpaceFlows).some((input) => input.q === "zzz")).toBe(true),
    );
    expect(await screen.findByText("Aucun parcours ne correspond à « zzz »")).toBeInTheDocument();
  });

  it("fonctionnalités : la recherche appelle clientSpace.features avec q", async () => {
    renderClient();
    await userEvent.type(
      await screen.findByRole("searchbox", { name: "Rechercher une fonctionnalité" }),
      "F-200",
    );
    await waitFor(() =>
      expect(inputsOf(procedures.clientSpaceFeatures).some((input) => input.q === "F-200")).toBe(
        true,
      ),
    );
  });
});

describe("Vue client : totaux du serveur, jamais la longueur des pages", () => {
  it("248 fonctionnalités dont 50 chargées : l'en-tête, l'onglet et le compte disent 248", async () => {
    const items = Array.from({ length: 50 }, (_, i) => feature(i + 1));
    procedures.clientSpaceFeatures.mockResolvedValue({
      items,
      nextCursor: "c2",
      previousCursor: null,
      offset: 0,
      total: 248,
      version: "v1",
    });
    procedures.clientSpaceProgress.mockResolvedValue(
      progress({
        tabs: {
          features: { count: 248, units: 248, treated: 6, toRevise: 0 },
          flows: { count: 18, units: 18, treated: 0, toRevise: 0 },
          rules: { count: 86, units: 1, treated: 0, toRevise: 0 },
          roles: { count: 3, units: 1, treated: 0, toRevise: 0 },
        },
      }),
    );
    renderClient();
    await screen.findByRole("button", { name: /F-001/ });
    const nav = screen.getByRole("navigation", { name: "Sections du cahier fonctionnel" });
    expect(within(nav).getByRole("link", { name: /Fonctionnalités/ })).toHaveTextContent("248");
    expect(screen.getAllByText(/248/).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/50 chargées/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/242 à traiter/)[0]).toBeInTheDocument();
    // Maquette 10 : cadre à défilement interne de 600 px, pied dans le cadre.
    const frame = document.querySelector("[data-slot='virtual-list']");
    expect(frame?.className).toContain("max-h-[600px]");
  });
});
