import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_ID,
  renderArchitecture,
  SHA40,
  serveArchitecture,
  ZONE_ENTRIES,
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

/** TK-112 lot B, cas 7 : onglet Schéma (maquette 13 l.175-239) : couches, nœuds, fiche, vue des zones, droits. */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
});

const region = (name: RegExp | string = "Schéma d'architecture") =>
  screen.findByRole("region", { name });
const node = (name: RegExp | string) => screen.findByRole("button", { name });

/** 34 composants en 6 zones : la vue des zones s'ouvre d'abord. */
function serveManyZones() {
  const zones = [
    "Paiement",
    "Personnel",
    "Catalogue",
    "Clients",
    "Communication",
    "Prise de rendez-vous",
  ].map((name, index) => ({
    ...ZONE_ENTRIES[0],
    id: `Z-${index}`,
    name,
    componentCount: index === 0 ? 9 : 5 + index,
    links: index === 0 ? [{ to: "Z-1", count: 3 }] : [],
    preview: ["API", "Base"],
  }));
  procedures.specArchitectureZones.mockResolvedValue({
    zones,
    componentCount: 34,
    commitSha: SHA40,
  });
  procedures.specArchitectureZone.mockImplementation(async (input: unknown) => {
    const { zone } = input as { zone: string };
    return {
      zone: { id: zone, name: "Paiement", icon: "payments", componentCount: 9 },
      components: [
        { specId: "C-caisse", name: "Caisse", type: "service", responsibility: "Encaisse." },
      ],
      relations: [],
      actors: [],
      outgoing: [{ zone: "Z-1", count: 3 }],
      truncated: false,
      commitSha: SHA40,
    };
  });
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Schéma : lecteur", () => {
  it("par défaut sur le bureau : le schéma par couches, formes écrites, acteur, appels asynchrones en pointillés", async () => {
    serveArchitecture("owner");
    renderArchitecture({ wide: true });
    expect(await region()).toHaveAttribute("tabindex", "0");
    for (const label of [
      "Utilisateurs",
      "Applications",
      "Services",
      "Données et services externes",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(await node("Acteur Client")).toHaveAttribute("aria-pressed", "false");
    expect(await node("Service API")).toBeVisible();
    expect(await node("Application Application web")).toBeVisible();
    expect(await node("Externe Fournisseur SMS")).toBeVisible();
    // Le type reste écrit : la forme et la couleur ne le portent jamais seules.
    expect(screen.getAllByText("Externe").length).toBeGreaterThan(0);
    expect(screen.getByText("asynchrone")).toBeVisible();
    expect(screen.getByRole("toolbar", { name: "Zoom du diagramme" })).toBeVisible();
  });

  it("un clic sur un composant le choisit (?sel=) et ouvre sa fiche ; Fiche, YAML, Mermaid", async () => {
    serveArchitecture("owner");
    renderArchitecture({ wide: true });
    await userEvent.click(await node("Service API"));
    await waitFor(() => expect(window.location.search).toContain("sel=C-api"));
    expect(await node("Service API")).toHaveAttribute("aria-pressed", "true");
    const fiche = await screen.findByRole("complementary", { name: "Fiche du composant" });
    expect(within(fiche).getByText("C-api")).toBeVisible();
    expect(
      await within(fiche).findByText("Cœur du produit : règles métier, réservations, créneaux."),
    ).toBeVisible();
    expect(within(fiche).getByText("T-reservation")).toBeVisible();
    await userEvent.click(within(fiche).getByRole("button", { name: "YAML" }));
    expect(await within(fiche).findByText("architecture/components/C-api.yaml")).toBeVisible();
    expect(within(fiche).getByText("Source de vérité")).toBeVisible();
    await userEvent.click(within(fiche).getByRole("button", { name: "Mermaid" }));
    expect(await within(fiche).findByText("architecture/schema.mmd")).toBeVisible();
    expect(within(fiche).getByText("Généré")).toBeVisible();
  });

  it("un acteur n'a que sa fiche : ni YAML ni Mermaid ni « Modifier »", async () => {
    serveArchitecture("owner");
    renderArchitecture({ wide: true, search: "sel=RL-client" });
    const fiche = await screen.findByRole("complementary", { name: "Fiche du composant" });
    expect(within(fiche).getByText("RL-client")).toBeVisible();
    expect(within(fiche).queryByRole("button", { name: "YAML" })).toBeNull();
    expect(within(fiche).queryByRole("button", { name: "Modifier" })).toBeNull();
  });

  it("« / » amène le focus sur « Aller à un composant… »", async () => {
    serveArchitecture("owner");
    renderArchitecture({ wide: true });
    await region();
    await userEvent.keyboard("/");
    expect(screen.getByRole("combobox", { name: "Aller à un composant" })).toHaveFocus();
  });

  it("le fil compte les composants, le zoom s'annonce, l'aide dit quoi faire", async () => {
    serveArchitecture("owner");
    renderArchitecture({ wide: true });
    await region();
    // Sans zones, le fil est masqué (maquette 13 l.178) ; la recherche « / » reste.
    expect(screen.queryByText(/Toutes les zones/)).toBeNull();
    expect(screen.getByRole("combobox", { name: "Aller à un composant" })).toBeVisible();
    expect(screen.getByText("Cliquez un composant pour voir sa fiche.")).toBeVisible();
    expect(screen.getByText(/^Zoom \d+ %$/)).toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Schéma : vue des zones", () => {
  it("au-delà de 25 composants : une carte par zone, 34 composants, un trait par paire de zones", async () => {
    serveArchitecture("owner");
    serveManyZones();
    renderArchitecture({ wide: true });
    expect(await screen.findByText("Toutes les zones · 34 composants")).toBeVisible();
    expect(screen.getByText(/Vue des zones : 34 composants en 6 zones/)).toBeVisible();
    const cards = screen.getAllByRole("button", { name: /^Zone / });
    expect(cards.length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText("3 liens")).toBeInTheDocument();
  });

  it("une zone ouverte : ses composants, une carte estompée par zone voisine qui ouvre l'autre zone", async () => {
    serveArchitecture("owner");
    serveManyZones();
    renderArchitecture({ wide: true });
    await userEvent.click(
      (await screen.findAllByRole("button", { name: /^Zone Paiement/ }))[0] as HTMLElement,
    );
    await waitFor(() => expect(window.location.search).toContain("zone=Paiement"));
    expect(await node("Service Caisse")).toBeVisible();
    const ghost = await node("Service Personnel, autre zone");
    expect(ghost).not.toHaveAttribute("aria-pressed");
    expect(screen.getByText("Hors zone")).toBeVisible();
    expect(
      await screen.findByRole("button", { name: "Toutes les zones · 34 composants" }),
    ).toBeVisible();
    await userEvent.click(ghost);
    await waitFor(() => expect(window.location.search).toContain("zone=Personnel"));
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Schéma : droits, vide, erreur", () => {
  it("équipe qui écrit : les nœuds se glissent ; designer : lecture seule, sans « Modifier »", async () => {
    serveArchitecture("owner");
    renderArchitecture({ wide: true, search: "sel=C-api" });
    await node("Service API");
    expect(document.querySelector("[data-slot='diagram-node']")?.className).toContain(
      "cursor-grab",
    );
    expect(await screen.findByRole("button", { name: "Modifier" })).toBeVisible();
  });

  it("designer : lit le schéma, la fiche et les sources, sans glisser ni « Modifier »", async () => {
    serveArchitecture("designer");
    renderArchitecture({ wide: true, search: "sel=C-api" });
    await node("Service API");
    expect(document.querySelector("[data-slot='diagram-node']")?.className).not.toContain(
      "cursor-grab",
    );
    const fiche = await screen.findByRole("complementary", { name: "Fiche du composant" });
    expect(within(fiche).queryByRole("button", { name: "Modifier" })).toBeNull();
    expect(within(fiche).getByRole("button", { name: "YAML" })).toBeVisible();
  });

  it("le glisser enregistre toute la vue une fois, 600 ms après le dernier geste (architecture.layout.save)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      serveArchitecture("owner");
      renderArchitecture({ wide: true });
      const api = await node("Service API");
      const slot = api.closest("[data-slot='diagram-node']") as HTMLElement;
      const mouse = (type: string, x: number, y: number) =>
        new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      slot.dispatchEvent(mouse("pointerdown", 100, 100));
      window.dispatchEvent(mouse("pointermove", 160, 140));
      window.dispatchEvent(mouse("pointerup", 160, 140));
      await vi.advanceTimersByTimeAsync(700);
      expect(procedures.specArchitectureLayoutSave).toHaveBeenCalledTimes(1);
      const sent = procedures.specArchitectureLayoutSave.mock.calls[0]?.[0] as {
        projectId: string;
        positions: Record<string, { x: number; y: number }>;
      };
      expect(sent.projectId).toBe(PROJECT_ID);
      expect(Object.keys(sent.positions)).toContain("C-api");
    } finally {
      vi.useRealTimers();
    }
  });

  it("aucun composant : « Aucun composant à afficher »", async () => {
    serveArchitecture("owner");
    procedures.specArchitectureZones.mockResolvedValue({
      zones: [],
      componentCount: 0,
      commitSha: SHA40,
    });
    renderArchitecture({ wide: true, search: "tab=schema" });
    expect(await screen.findByText("Aucun composant à afficher")).toBeVisible();
  });

  it("lecture des zones en échec : message et « Réessayer »", async () => {
    serveArchitecture("owner");
    procedures.specArchitectureZones.mockRejectedValue(new Error("boom"));
    renderArchitecture({ wide: true, search: "tab=schema" });
    expect(await screen.findByText("Impossible de charger le schéma")).toBeVisible();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeVisible();
  });
});
