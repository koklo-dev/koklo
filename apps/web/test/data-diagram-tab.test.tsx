import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZOOM_STORAGE_KEY } from "../src/lib/diagram-zoom-storage.ts";
import { renderData, serveData } from "./support/data.tsx";
import { polyfillRadix, procedures, resetWebMocks, watchUrl } from "./support/web-mocks.ts";
import { DESKTOP, MOBILE, setViewport } from "./viewport.ts";

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

/** TK-108 lot C : l'onglet Diagramme (lecteur plein cadre, sélection, glisser enregistré, zoom mémorisé). */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  setViewport(DESKTOP);
  window.localStorage.clear();
});

const viewer = () => screen.findByRole("region", { name: "Diagramme entité-relation" });
const card = async (name: string) =>
  within(await viewer()).findByRole("button", { name: new RegExp(`^Table ${name},`) });

describe("Onglet Diagramme : lecteur", () => {
  it("région nommée, une carte bouton par table (aria-pressed), barre de zoom, SVG masqué, aide", async () => {
    serveData("owner");
    renderData();
    const region = await viewer();
    expect(region).toHaveAttribute("tabindex", "0");
    const reservation = within(region).getByRole("button", { name: "Table Réservation, 3 champs" });
    expect(reservation).toHaveAttribute("aria-pressed", "false");
    expect(within(region).getAllByRole("button", { name: /^Table / })).toHaveLength(3);
    expect(screen.getByRole("toolbar", { name: "Zoom du diagramme" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot='diagram-viewer'] svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText("Cliquez une table pour voir sa fiche.")).toBeInTheDocument();
    expect(screen.getByText("un vers plusieurs")).toBeInTheDocument();
  });

  it("une relation du Mermaid est tracée avec sa cardinalité en étiquette", async () => {
    serveData("owner");
    renderData();
    await viewer();
    expect(document.querySelectorAll("[data-slot='diagram-viewer'] svg line")).toHaveLength(1);
    expect(
      within(document.querySelector("[data-slot='diagram-viewer']") as HTMLElement).getByText(
        "n → 1",
      ),
    ).toBeInTheDocument();
  });

  it("sélectionner une table la marque et ouvre sa fiche ancrée", async () => {
    serveData("owner");
    renderData();
    await userEvent.click(await card("Réservation"));
    expect(await card("Réservation")).toHaveAttribute("aria-pressed", "true");
    const fiche = await screen.findByRole("complementary", { name: "Fiche de la table" });
    expect(within(fiche).getByRole("heading", { level: 2, name: "Réservation" })).toBeVisible();
    // La sélection est portée par l'adresse (remplacement, sans entrée d'historique).
    expect(window.location.search).toContain("sel=T-reservation");
  });

  it("erreur de lecture : message et « Réessayer »", async () => {
    serveData("owner");
    procedures.specDataMermaid.mockRejectedValue(new Error("boom"));
    renderData();
    expect(await screen.findByText("Impossible de charger le diagramme")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Diagramme : positions enregistrées", () => {
  const ALL_SAVED = {
    "T-client": { x: 400, y: 300 },
    "T-reservation": { x: 700, y: 300 },
    "T-service": { x: 100, y: 100 },
  };
  const slotOf = async (name: string) =>
    (await card(name)).closest("[data-slot='diagram-node']") as HTMLElement;

  it("positions du dépôt pour toutes les tables de la vue : appliquées (B481)", async () => {
    serveData("owner");
    procedures.specDataLayoutGet.mockResolvedValue({
      positions: ALL_SAVED,
      commitSha: "a".repeat(40),
    });
    renderData();
    const slot = await slotOf("Client");
    await waitFor(() => expect(slot.style.left).toBe("400px"));
    expect(slot.style.top).toBe("300px");
  });

  it("positions du dépôt pour une partie des tables seulement : placement automatique, sans mélange (B481)", async () => {
    serveData("owner");
    procedures.specDataLayoutGet.mockResolvedValue({
      positions: { "T-client": { x: 400, y: 300 } },
      commitSha: "a".repeat(40),
    });
    renderData();
    await waitFor(() => expect(procedures.specDataLayoutGet).toHaveBeenCalled());
    const slot = await slotOf("Client");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(slot.style.left).not.toBe("400px");
  });

  it("Alt + flèche déplace la table de 20 px et un seul dépôt part 600 ms après le dernier geste", async () => {
    serveData("owner");
    renderData();
    (await card("Client")).focus();
    await userEvent.keyboard("{Alt>}{ArrowRight}{ArrowRight}{/Alt}");
    expect(procedures.specDataLayoutSave).not.toHaveBeenCalled();
    await waitFor(() => expect(procedures.specDataLayoutSave).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    const input = procedures.specDataLayoutSave.mock.calls[0]?.[0] as {
      projectId: string;
      idempotencyKey: string;
      positions: Record<string, { x: number; y: number }>;
    };
    expect(input.idempotencyKey).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
    // Toute la vue est enregistrée (B481) : les trois tables, placement automatique compris.
    expect(Object.keys(input.positions).sort()).toEqual(["T-client", "T-reservation", "T-service"]);
    expect(Number.isInteger(input.positions["T-client"]?.x)).toBe(true);
    expect(await screen.findByText("Client déplacée")).toBeInTheDocument();
  });

  it("le dépôt envoie tout le plan : les positions du dépôt et la table déplacée", async () => {
    serveData("owner");
    procedures.specDataLayoutGet.mockResolvedValue({
      positions: ALL_SAVED,
      commitSha: "a".repeat(40),
    });
    renderData();
    const service = await slotOf("Service");
    await waitFor(() => expect(service.style.left).toBe("100px"));
    (await card("Client")).focus();
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await waitFor(() => expect(procedures.specDataLayoutSave).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    const input = procedures.specDataLayoutSave.mock.calls[0]?.[0] as {
      positions: Record<string, { x: number; y: number }>;
    };
    expect(input.positions).toEqual({ ...ALL_SAVED, "T-client": { x: 400, y: 320 } });
  });

  it("échec du dépôt : toast d'erreur, la table garde sa place, nouvelle tentative au dépôt suivant", async () => {
    serveData("owner");
    procedures.specDataLayoutSave.mockRejectedValueOnce(new Error("boom"));
    renderData();
    const client = await card("Client");
    client.focus();
    await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(
      await screen.findByText("Mise en page non enregistrée", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    const slot = client.closest("[data-slot='diagram-node']") as HTMLElement;
    const left = slot.style.left;
    await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(() => expect(procedures.specDataLayoutSave).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    expect(Number.parseInt(slot.style.left, 10)).toBe(Number.parseInt(left, 10) + 20);
  });

  it("designer : lecture seule, Alt + flèche ne déplace rien et rien n'est enregistré", async () => {
    serveData("designer");
    renderData();
    (await card("Client")).focus();
    await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(procedures.specDataLayoutSave).not.toHaveBeenCalled();
  });
});

describe("Onglet Diagramme : zoom mémorisé", () => {
  it("le zoom choisi est gardé dans le navigateur et rouvert au retour", async () => {
    serveData("owner");
    const first = renderData();
    await viewer();
    await userEvent.click(screen.getByRole("button", { name: "Zoomer" }));
    expect(window.localStorage.getItem(ZOOM_STORAGE_KEY)).toBe("1.1");
    first.unmount();
    renderData();
    await viewer();
    expect(await screen.findByText("Zoom 110 %")).toBeInTheDocument();
  });

  it("sous 60 %, l'aide dit que seuls les noms s'affichent", async () => {
    serveData("owner");
    renderData();
    await viewer();
    for (let i = 0; i < 4; i += 1)
      await userEvent.click(screen.getByRole("button", { name: "Dézoomer" }));
    expect(
      screen.getByText(
        "Zoom sous 60 % : seuls les noms des tables s'affichent. Zoomez pour voir les champs.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("telephone")).toBeNull();
    expect(screen.getByRole("button", { name: "Table Réservation, 3 champs" })).toBeInTheDocument();
  });

  it("sous 1024 px, Tables s'ouvre par défaut", async () => {
    setViewport(MOBILE);
    serveData("owner");
    renderData();
    expect(
      await screen.findByRole("table", { name: "Tables du modèle de données" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Diagramme entité-relation" })).toBeNull();
  });

  it("sous 1024 px, le diagramme demandé s'ouvre en « Ajuster » sans lire le zoom mémorisé", async () => {
    setViewport(MOBILE);
    window.localStorage.setItem(ZOOM_STORAGE_KEY, "1.5");
    serveData("owner");
    renderData({ search: "tab=diagram" });
    await viewer();
    expect(screen.queryByText("Zoom 150 %")).toBeNull();
  });
});
