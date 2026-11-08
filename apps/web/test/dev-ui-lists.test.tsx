import { ToastProvider } from "@koklo/ui";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { polyfillRadix } from "./support/web-mocks.ts";

/**
 * TK-94 lot B : section « Listes longues » de la galerie `/dev/ui` (fiche S-dev-ui v2, §3).
 * Données fictives statiques, aucun appel réseau, aucune couleur en dur, aucun nom de fournisseur d'IA.
 */
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dev/ui",
  useSearchParams: () => new URLSearchParams(),
}));

async function renderGallery(): Promise<void> {
  vi.stubEnv("API_INTERNAL_URL", "http://127.0.0.1:3101");
  vi.stubEnv("APP_VERSION", "0.0.0-test");
  vi.stubEnv("APP_ENV", "test");
  const { default: Page } = await import("../src/app/dev/ui/page.tsx");
  render(
    <ToastProvider>
      {(await (Page as () => ReactElement | Promise<ReactElement>)()) as ReactElement}
    </ToastProvider>,
  );
}

beforeEach(() => {
  polyfillRadix();
  localStorage.clear();
});
afterEach(() => vi.unstubAllEnvs());

const section = () => screen.getByRole("region", { name: "Listes longues" });
const slot = (name: string) => [...section().querySelectorAll(`[data-slot='${name}']`)];
/** Les milliers sont séparés par une espace insécable : on compare le texte avec des espaces ordinaires. */
const plain = (text: string | null) => (text ?? "").replace(/\s/g, " ");

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("galerie : section « Listes longues » (S-dev-ui §3)", () => {
  it("h2 « Listes longues », après EmptyState et PhaseRail", async () => {
    await renderGallery();
    const h2 = within(section()).getByRole("heading", { level: 2, name: "Listes longues" });
    const phase = document.querySelector("[data-slot='phase-rail']") as HTMLElement;
    expect(phase.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("VirtualList : 1 000 lignes fictives, aria-setsize 1000, jamais plus de 80 lignes dans le DOM", async () => {
    await renderGallery();
    const list = within(section()).getByRole("list", { name: "Fonctionnalités (exemple)" });
    const items = within(list).getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(80);
    for (const item of items) expect(item).toHaveAttribute("aria-setsize", "1000");
    expect(items[0]).toHaveTextContent("F-001");
    expect(items.filter((i) => i.getAttribute("aria-current") === "true")).toHaveLength(1);
  });

  it("CountBar : version complète et version filtrée", async () => {
    await renderGallery();
    const bars = slot("count-bar");
    expect(bars.map((b) => plain(b.textContent))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("1 000 fonctionnalités · 50 chargées · 31 à valider"),
      ]),
    );
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  it("ListFooter : les quatre états côte à côte", async () => {
    await renderGallery();
    const states = slot("list-footer").map((el) => el.getAttribute("data-state"));
    for (const state of ["more", "loading", "error", "end"]) expect(states).toContain(state);
    expect(section()).toHaveTextContent(
      "Impossible de charger la suite. Les 100 premières restent affichées.",
    );
    expect(section()).toHaveTextContent("Fin de la liste · 1 000 fonctionnalités");
  });

  it("« Charger la suite » fait avancer la démonstration sans réseau", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await renderGallery();
    const button = within(section()).getAllByRole("button", {
      name: "Charger la suite",
    })[0] as HTMLElement;
    await userEvent.click(button);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("recherche vide : EmptyState « annulation groupée »", async () => {
    await renderGallery();
    expect(
      within(section()).getByText("Aucune fonctionnalité ne correspond à « annulation groupée »"),
    ).toBeVisible();
    expect(
      within(section()).getByText(
        "La recherche porte sur les 1 000 fonctionnalités, pas seulement celles affichées.",
      ),
    ).toBeVisible();
  });

  it("Pagination : « 1–25 sur 1 240 », page 20 avec ellipses, première et dernière page", async () => {
    await renderGallery();
    const navs = within(section()).getAllByRole("navigation", { name: "Pagination" });
    expect(navs.length).toBeGreaterThanOrEqual(3);
    const text = navs.map((n) => plain(n.textContent));
    expect(text.some((t) => t.includes("1–25 sur 1 240"))).toBe(true);
    expect(navs.some((n) => n.querySelector("[aria-current='page']")?.textContent === "20")).toBe(
      true,
    );
    // Première et dernière page : précédent / suivant désactivés, sans texte de raison (B160).
    expect(text.some((t) => t.includes("Première page"))).toBe(false);
    expect(text.some((t) => t.includes("Dernière page"))).toBe(false);
    const disabled = within(section()).getAllByRole("button", {
      name: /^Page (précédente|suivante)$/,
    });
    expect(disabled.filter((b) => (b as HTMLButtonElement).disabled)).toHaveLength(2);
    for (const nav of navs) {
      expect(within(nav).getByRole("group", { name: "Lignes par page" })).toBeVisible();
    }
  });

  it("CountBar : recherche vide « 0 résultat pour « annulation groupée »»", async () => {
    await renderGallery();
    expect(
      slot("count-bar").some((b) =>
        plain(b.textContent).includes("0 résultat pour « annulation groupée »"),
      ),
    ).toBe(true);
  });

  it("VirtualList : cadre arrondi et 4 lignes fantômes pendant le chargement", async () => {
    await renderGallery();
    const frame = slot("virtual-list")[0] as HTMLElement;
    expect(frame.className).toMatch(/rounded-xl/);
    await userEvent.click(
      within(section()).getAllByRole("button", { name: "Charger la suite" })[0] as HTMLElement,
    );
    expect(frame.querySelectorAll("[data-slot='skeleton-row']")).toHaveLength(4);
  });

  it("GroupSection empilés : bordure basse, action visible repliée", async () => {
    await renderGallery();
    const stacked = slot("group-section").filter((g) => /\bborder-b\b/.test(g.className));
    expect(stacked).toHaveLength(2);
    const collapsed = stacked.find(
      (g) => g.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded") === "false",
    ) as HTMLElement;
    expect(
      within(collapsed).getByRole("button", { name: "Accepter les 12 restantes" }),
    ).toBeVisible();
  });

  it("GroupSection : un groupe ouvert avec 8 lignes et « Afficher 20 de plus », un groupe replié", async () => {
    await renderGallery();
    const groups = slot("group-section");
    expect(groups.length).toBe(4);
    const toggles = groups.map((g) =>
      g.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded"),
    );
    expect(toggles).toEqual(["true", "false", "true", "false"]);
    expect(groups[0]?.querySelectorAll("li")).toHaveLength(8);
    expect(
      within(groups[0] as HTMLElement).getByRole("button", {
        name: /^Afficher 20 de plus · \d+ restantes dans ce groupe$/,
      }),
    ).toBeVisible();
    expect(
      within(section()).getByRole("button", { name: "Accepter les 22 restantes" }),
    ).toBeVisible();
  });

  it("ZoneNode et DiagramMinimap : trois zones fictives et leur mini-carte", async () => {
    await renderGallery();
    for (const name of [
      "Zone Réservation 14 tables",
      "Zone Clients 9 tables",
      "Zone Paiement 7 tables",
    ]) {
      expect(within(section()).getByRole("button", { name })).toBeVisible();
    }
    expect(
      within(section()).getByRole("button", { name: /Mini-carte du diagramme/ }),
    ).toBeVisible();
    expect(slot("diagram-minimap")).toHaveLength(1);
  });

  it("aucune couleur en dur, aucun nom de fournisseur d'IA dans la section", async () => {
    await renderGallery();
    expect(section().textContent).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(section().textContent).not.toMatch(/Anthropic|OpenAI|Claude/);
  });
});
