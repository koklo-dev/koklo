import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FeaturesLayout from "../src/app/projects/[projectId]/features/layout.tsx";
import * as route from "../src/app/projects/[projectId]/features/page.tsx";
import {
  FEATURES,
  findTable,
  PROJECT_ID,
  page,
  renderFeatures,
  serve,
} from "./support/features.tsx";
import {
  pathname,
  polyfillRadix,
  procedures,
  resetWebMocks,
  setUrl,
  watchUrl,
} from "./support/web-mocks.ts";
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

/**
 * TK-48 / 48d : route, gabarit, accessibilité, responsive 375 px et mouvement réduit
 * (design/screens/S-features.md §6, §7 ; un seul h1, un seul fil d'Ariane, un seul role=status).
 */
beforeEach(() => {
  resetWebMocks();
  polyfillRadix();
  watchUrl();
  setViewport(DESKTOP);
  serve();
});

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("Route /projects/[projectId]/features", () => {
  it("la page déclare le titre « Fonctionnalités · Koklo »", () => {
    const { metadata } = route as { metadata?: { title?: string } };
    expect(metadata?.title).toBe("Fonctionnalités · Koklo");
  });

  it("la page rend l'écran du projet de l'adresse (params asynchrones)", async () => {
    setUrl(`/projects/${PROJECT_ID}/features`);
    const element = await route.default({ params: Promise.resolve({ projectId: PROJECT_ID }) });
    render(<QueryClientProvider client={client()}>{element}</QueryClientProvider>);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Fonctionnalités" }),
    ).toBeInTheDocument();
    await findTable();
    expect(procedures.specHead.mock.calls[0]?.[0]).toMatchObject({ projectId: PROJECT_ID });
  });

  it("un projectId qui n'est pas un uuid arrive jusqu'à l'écran « Projet introuvable » sans appel de spec", async () => {
    setUrl("/projects/pas-un-uuid/features");
    const element = await route.default({ params: Promise.resolve({ projectId: "pas-un-uuid" }) });
    render(<QueryClientProvider client={client()}>{element}</QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "Projet introuvable" })).toBeInTheDocument();
    expect(procedures.specHead).not.toHaveBeenCalled();
  });
});

describe("Gabarit de la route", () => {
  async function renderFramed() {
    pathname.current = `/projects/${PROJECT_ID}/features`;
    setUrl(`/projects/${PROJECT_ID}/features`);
    const element = await route.default({ params: Promise.resolve({ projectId: PROJECT_ID }) });
    render(
      <QueryClientProvider client={client()}>
        <FeaturesLayout>{element}</FeaturesLayout>
      </QueryClientProvider>,
    );
    await findTable();
  }

  it("un seul main, un seul h1, un seul fil d'Ariane (Koklo > Projets > nom > Fonctionnalités)", async () => {
    await renderFramed();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const crumbs = screen.getByRole("navigation", { name: /breadcrumb|fil d'ariane/i });
    expect(crumbs).toHaveTextContent(/Koklo.*Projets.*Alpha.*Fonctionnalités/);
    expect(within(crumbs).getByRole("link", { name: "Projets" })).toHaveAttribute(
      "href",
      "/projects",
    );
  });

  it("la barre latérale est présente et l'entrée du projet courant est en aria-current=page", async () => {
    await renderFramed();
    const sidebar = document.querySelector('[data-slot="sidebar"]') as HTMLElement;
    expect(sidebar).not.toBeNull();
    const current = await within(sidebar).findByRole("link", { name: /Alpha/ });
    expect(current).toHaveAttribute("href", `/projects/${PROJECT_ID}/features`);
    expect(current).toHaveAttribute("aria-current", "page");
  });
});

describe("Accessibilité de la liste (§7)", () => {
  it("un seul role=status poli à l'écran (compteur, chargement, annonces)", async () => {
    renderFeatures();
    await findTable();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("les deux Select ont un libellé visible lié", async () => {
    renderFeatures();
    await findTable();
    for (const name of ["Statut", "Priorité"]) {
      const select = screen.getByRole("combobox", { name });
      expect(select).toHaveAccessibleName(name);
      expect(screen.getByLabelText(name)).toBe(select);
    }
  });

  it("toutes les icônes de la table sont décoratives (aria-hidden), jamais le seul porteur de sens", async () => {
    renderFeatures();
    const table = await findTable();
    const icons = table.querySelectorAll("svg");
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("ordre de focus : filtres, liens de titre dans l'ordre de la table, puis « Afficher plus »", async () => {
    procedures.specListFeatures.mockResolvedValue(page(1, 3, "c1"));
    renderFeatures({ search: "?status=specifiee" });
    await findTable();
    const order = Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, a[href], [role='combobox'], input, [tabindex='0']",
      ),
    )
      .map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "")
      .filter(Boolean);
    const at = (text: string) => order.findIndex((label) => label.includes(text));
    expect(at("Statut")).toBeLessThan(at("Effacer les filtres"));
    expect(at("Effacer les filtres")).toBeLessThan(at("Fonctionnalité numéro 1"));
    expect(at("Fonctionnalité numéro 1")).toBeLessThan(at("Fonctionnalité numéro 3"));
    expect(at("Fonctionnalité numéro 3")).toBeLessThan(at("Afficher plus"));
  });

  it("aucun tabindex positif", async () => {
    renderFeatures();
    await findTable();
    expect(
      document.querySelector("[tabindex]:not([tabindex='-1']):not([tabindex='0'])"),
    ).toBeNull();
  });
});

describe("Mobile 375 px (§6)", () => {
  beforeEach(() => setViewport(375));

  it("colonnes Statut, Priorité, Critères retirées de l'arbre d'accessibilité (hidden md:table-cell)", async () => {
    renderFeatures();
    const table = await findTable();
    for (const name of ["Statut", "Priorité", "Critères"]) {
      const header = within(table).getByRole("columnheader", { name, hidden: true });
      expect(header.className).toMatch(/\bhidden\b/);
      expect(header.className).toMatch(/md:table-cell/);
    }
    for (const name of ["Identifiant", "Titre"]) {
      expect(within(table).getByRole("columnheader", { name }).className).not.toMatch(/\bhidden\b/);
    }
  });

  it("ligne méta md:hidden sous le titre : statut, priorité et critères, sans perte d'information", async () => {
    renderFeatures();
    const table = await findTable();
    const meta = Array.from(table.querySelectorAll<HTMLElement>("*")).filter(
      (el) => /\bmd:hidden\b/.test(el.className) && /Brouillon/.test(el.textContent ?? ""),
    );
    expect(meta.length).toBeGreaterThan(0);
    const text = meta[0]?.textContent ?? "";
    expect(text).toContain("Indispensable");
    expect(text).toContain("3 critères");
  });

  it("« Afficher plus de fonctionnalités », filtres et « Effacer » à 44 px, pleine largeur", async () => {
    procedures.specListFeatures.mockResolvedValue(page(1, 3, "c1"));
    renderFeatures({ search: "?status=specifiee" });
    await findTable();
    for (const control of [
      screen.getByRole("button", { name: "Afficher plus de fonctionnalités" }),
      screen.getByRole("button", { name: "Effacer les filtres" }),
    ]) {
      expect(control.className).toMatch(/\bh-11\b/);
      expect(control.className).toMatch(/\bw-full\b|\bmax-md:w-full\b/);
    }
    expect(screen.getByRole("combobox", { name: "Statut" }).className).toMatch(
      /\bh-11\b|max-md:h-11/,
    );
  });

  it("aucun défilement horizontal imposé à la page (pas de largeur fixe ni d'overflow-x sur le conteneur)", async () => {
    renderFeatures();
    const table = await findTable();
    expect(table.className).not.toMatch(/\bmin-w-\[?\d+/);
    expect(document.body.innerHTML).not.toMatch(/\bw-\[(?:[4-9]\d{2}|\d{4,})px\]/);
  });
});

describe("Mouvement réduit et chargement (§7)", () => {
  it("squelette pulsant seulement sous motion-safe:", async () => {
    procedures.specHead.mockImplementation(() => new Promise(() => undefined));
    renderFeatures();
    await screen.findByRole("status");
    const animated = Array.from(document.querySelectorAll<HTMLElement>("[class*='animate-']"));
    expect(animated.length).toBeGreaterThan(0);
    for (const element of animated) {
      for (const token of element.className.split(/\s+/).filter((t) => /animate-/.test(t))) {
        expect(token, `animation sans garde : ${token}`).toMatch(/^motion-safe:/);
      }
    }
  });

  it("aucune animation hors squelette dans la liste (aucun animate-* ni transition de couleur imposée)", async () => {
    renderFeatures();
    await findTable();
    expect(document.body.innerHTML).not.toMatch(/(^|[\s"])animate-(spin|pulse|bounce|ping)/);
  });
});

describe("Données volumineuses", () => {
  it("50 lignes : un seul tableau, un lien par ligne, aucun doublon d'identifiant de lien", async () => {
    procedures.specListFeatures.mockResolvedValue(page(1, 50, "c1"));
    renderFeatures();
    const table = await findTable();
    expect(within(table).getAllByRole("link")).toHaveLength(50);
    expect(FEATURES).toHaveLength(3);
  });
});
