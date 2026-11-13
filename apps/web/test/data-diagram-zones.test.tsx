import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderData, SHA40, serveData, tableRow } from "./support/data.tsx";
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

/** B478 : au-delà de 25 tables en plusieurs zones, le diagramme s'ouvre par zones (maquette 11, DESIGN §5.3 schéma 1.3). */
const ROWS = Array.from({ length: 30 }, (_, i) => tableRow(i + 1));
const entity = (n: number) => `T_table_${String(n).padStart(3, "0")}`;
const MODEL = [
  "erDiagram",
  ...ROWS.map((_, i) => `  ${entity(i + 1)} {\n    uuid id PK\n  }`),
  // table-001 (Zone 2) → table-002 (Zone 3), table-004 (Zone 2) → table-002 : 2 relations entre Zone 2 et Zone 3.
  `  ${entity(1)} }o--|| ${entity(2)} : "n → 1"`,
  `  ${entity(4)} }o--|| ${entity(2)} : "n → 1"`,
  // table-001 → table-004 : interne à la Zone 2.
  `  ${entity(1)} }o--|| ${entity(4)} : "n → 1"`,
].join("\n");

beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  setViewport(DESKTOP);
  window.localStorage.clear();
  serveData("owner", { rows: ROWS });
  procedures.specDataMermaid.mockResolvedValue({ text: MODEL, generated: true, commitSha: SHA40 });
});

const zones = () => screen.findByRole("region", { name: "Diagramme par zones" });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Onglet Diagramme : vue par zones", () => {
  it("une carte par zone, fil « Toutes les zones », aide, relations entre zones comptées", async () => {
    renderData({ search: "tab=diagram" });
    const region = await zones();
    const cards = within(region).getAllByRole("button", { name: /^Zone / });
    expect(cards).toHaveLength(3);
    expect(
      within(region).getByRole("button", { name: "Zone Zone 2 10 tables · cliquez pour ouvrir" }),
    ).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", { name: "Fil du diagramme" });
    expect(within(crumbs).getByText("Toutes les zones · 30 tables")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByText(/^Vue des zones : 30 tables réparties en 3 zones\./),
    ).toBeInTheDocument();
    expect(within(region).getByText("2 relations")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-slot='diagram-viewer'] svg line")).toHaveLength(1);
  });

  it("ouvrir une zone : ses tables seules, liens sortants comptés, retour à toutes les zones", async () => {
    renderData({ search: "tab=diagram" });
    await userEvent.click(within(await zones()).getByRole("button", { name: /^Zone Zone 2 / }));
    const region = await screen.findByRole("region", {
      name: "Diagramme entité-relation, zone Zone 2",
    });
    expect(within(region).getAllByRole("button", { name: /^Table / })).toHaveLength(10);
    expect(new URLSearchParams(window.location.search).get("zone")).toBe("Zone 2");
    const crumbs = screen.getByRole("navigation", { name: "Fil du diagramme" });
    expect(within(crumbs).getByText("Zone 2")).toHaveAttribute("aria-current", "page");
    expect(
      within(crumbs).getByText("· 10 tables · 2 liens vers d'autres zones"),
    ).toBeInTheDocument();
    // La relation interne à la zone, puis un trait par table reliée vers la carte de la Zone 3 (B480).
    expect(document.querySelectorAll("[data-slot='diagram-viewer'] svg line")).toHaveLength(3);
    await userEvent.click(
      within(crumbs).getByRole("button", { name: "Toutes les zones · 30 tables" }),
    );
    expect(await zones()).toBeInTheDocument();
  });

  it("lien direct vers une table (?sel=) : sa zone s'ouvre et la table est choisie", async () => {
    renderData({ search: "tab=diagram&sel=T-table-002" });
    const region = await screen.findByRole("region", {
      name: "Diagramme entité-relation, zone Zone 3",
    });
    expect(within(region).getByRole("button", { name: /^Table Table 002,/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("« Aller à une table… » : nom exact puis Entrée, la zone s'ouvre sur la table", async () => {
    renderData({ search: "tab=diagram" });
    await zones();
    const jump = screen.getByRole("combobox", { name: "Aller à une table" });
    await userEvent.type(jump, "Table 007{Enter}");
    const region = await screen.findByRole("region", {
      name: "Diagramme entité-relation, zone Zone 2",
    });
    expect(within(region).getByRole("button", { name: /^Table Table 007,/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("« / » amène le focus dans « Aller à une table… »", async () => {
    renderData({ search: "tab=diagram" });
    await zones();
    await userEvent.keyboard("/");
    expect(screen.getByRole("combobox", { name: "Aller à une table" })).toHaveFocus();
  });

  it("zone voisine (B480) : une carte par zone reliée, un clic y passe", async () => {
    renderData({ search: "tab=diagram&zone=Zone%202" });
    const region = await screen.findByRole("region", {
      name: "Diagramme entité-relation, zone Zone 2",
    });
    const neighbor = within(region).getByRole("button", {
      name: "Zone Zone 3 10 tables · 2 relations · ouvrir",
    });
    expect(within(region).getAllByRole("button", { name: /^Zone / })).toHaveLength(1);
    await userEvent.click(neighbor);
    expect(
      await screen.findByRole("region", { name: "Diagramme entité-relation, zone Zone 3" }),
    ).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("zone")).toBe("Zone 3");
  });

  it("plein écran (B479) : bouton bascule, calque sur toute la fenêtre, Échap le referme", async () => {
    renderData({ search: "tab=diagram" });
    await zones();
    const toggle = screen.getByRole("button", { name: "Plein écran" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Plein écran" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(document.querySelector("[data-fullscreen]")).toHaveClass("fixed", "inset-0");
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector("[data-fullscreen]")).toBeNull();
  });
});
