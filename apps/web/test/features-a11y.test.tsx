import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as route from "../src/app/(shell)/projects/[projectId]/spec/functional/page.tsx";
import { ShellFrame } from "../src/components/shell-frame.tsx";
import {
  FEATURES,
  findList,
  PROJECT_ID,
  page,
  renderFeatures,
  serve,
} from "./support/features.tsx";
import { findNamed, findRole } from "./support/wait.ts";
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
  it("la page déclare le titre « Cahier fonctionnel · Koklo »", () => {
    const { metadata } = route as { metadata?: { title?: string } };
    expect(metadata?.title).toBe("Cahier fonctionnel · Koklo");
  });

  it("la page rend l'écran du projet de l'adresse (params asynchrones)", async () => {
    setUrl(`/projects/${PROJECT_ID}/spec/functional?tab=features`);
    const element = await route.default({ params: Promise.resolve({ projectId: PROJECT_ID }) });
    render(<QueryClientProvider client={client()}>{element}</QueryClientProvider>);
    expect(await findNamed("heading", "Cahier fonctionnel", { level: 1 })).toBeInTheDocument();
    await findList();
    expect(procedures.specHead.mock.calls[0]?.[0]).toMatchObject({ projectId: PROJECT_ID });
  });

  it("un projectId qui n'est pas un uuid arrive jusqu'à l'écran « Projet introuvable » sans appel de spec", async () => {
    setUrl("/projects/pas-un-uuid/spec/functional?tab=features");
    const element = await route.default({ params: Promise.resolve({ projectId: "pas-un-uuid" }) });
    render(<QueryClientProvider client={client()}>{element}</QueryClientProvider>);
    expect(await findNamed("heading", "Projet introuvable")).toBeInTheDocument();
    expect(procedures.specHead).not.toHaveBeenCalled();
  });
});

describe("Gabarit de la route", () => {
  async function renderFramed() {
    pathname.current = `/projects/${PROJECT_ID}/spec/functional`;
    setUrl(`/projects/${PROJECT_ID}/spec/functional?tab=features`);
    const element = await route.default({ params: Promise.resolve({ projectId: PROJECT_ID }) });
    render(
      <QueryClientProvider client={client()}>
        <ShellFrame>{element}</ShellFrame>
      </QueryClientProvider>,
    );
    await findList();
  }

  it("un seul main, un seul h1, un seul emplacement (Alpha / Spec / Fonctionnel), aucun fil d'Ariane v1", async () => {
    await renderFramed();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: /breadcrumb|fil d'ariane/i })).toBeNull();
    const location = screen.getByRole("navigation", { name: "Emplacement" });
    expect(location).toHaveTextContent(/Alpha.*Spec.*Fonctionnel/);
    expect(within(location).getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}`,
    );
  });

  it("la barre est présente et le livrable Fonctionnel est en aria-current=page", async () => {
    await renderFramed();
    const bar = screen.getByRole("navigation", { name: "Navigation principale" });
    const current = await findNamed("link", "Fonctionnel", { scope: within(bar) });
    expect(current).toHaveAttribute("href", `/projects/${PROJECT_ID}/spec/functional`);
    expect(current).toHaveAttribute("aria-current", "page");
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas, un test par comportement
describe("Accessibilité de la liste (§7)", () => {
  it("un seul role=status poli à l'écran (compteur, chargement, annonces)", async () => {
    renderFeatures();
    await findList();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("les deux Select ont un libellé visible lié", async () => {
    renderFeatures();
    await findList();
    for (const name of ["Statut", "Priorité"]) {
      const select = screen.getByRole("combobox", { name });
      expect(select).toHaveAccessibleName(name);
      expect(screen.getByLabelText(name)).toBe(select);
    }
  });

  // TK-87 : la table n'a plus d'icône de statut ; la jauge de LifecycleStatus et les barres de
  // PriorityIndicator sont les formes décoratives, toujours doublées d'un libellé.
  it("toutes les icônes et formes de la table sont décoratives (aria-hidden), jamais le seul porteur de sens", async () => {
    renderFeatures();
    const table = await findList();
    const shapes = table.querySelectorAll(
      "svg, [data-slot='lifecycle-status'] > span, [data-slot='priority-indicator'] > span",
    );
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) expect(shape).toHaveAttribute("aria-hidden", "true");
  });

  it("ordre de focus : recherche, filtres, une seule ligne de la liste, puis « Charger la suite »", async () => {
    procedures.specListFeatures.mockResolvedValue(page(1, 3, "c1"));
    renderFeatures({ search: "?status=specifiee" });
    await findList();
    const order = Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, [role='combobox'], input, [tabindex='0'], a[href]:not([tabindex='-1'])",
      ),
    )
      .map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.id)
      .filter(Boolean);
    const at = (text: string) => order.findIndex((label) => label.includes(text));
    expect(at("Statut")).toBeLessThan(at("Effacer les filtres"));
    expect(at("Effacer les filtres")).toBeLessThan(at("F-001"));
    // Une seule entrée dans la liste : les liens de titre n'entrent pas dans la tabulation (flèches entre lignes).
    const list = screen.getByRole("list", { name: "Fonctionnalités" });
    expect(list.querySelectorAll("a[href]:not([tabindex='-1'])")).toHaveLength(0);
    expect(list.querySelectorAll("[tabindex='0']")).toHaveLength(1);
    expect(at("F-001")).toBeLessThan(at("Charger la suite"));
    expect(at("Charger la suite")).toBeGreaterThan(-1);
  });

  it("aucun tabindex positif", async () => {
    renderFeatures();
    await findList();
    expect(
      document.querySelector("[tabindex]:not([tabindex='-1']):not([tabindex='0'])"),
    ).toBeNull();
  });
});

describe("Mobile 375 px (§6)", () => {
  beforeEach(() => setViewport(375));

  it("ligne méta md:hidden sous le titre : LifecycleStatus, PriorityIndicator et critères (TK-87)", async () => {
    renderFeatures();
    const table = await findList();
    // La ligne de 52 px garde l'identifiant et le titre ; avancement et priorité passent sous le titre.
    const meta = Array.from(table.querySelectorAll<HTMLElement>("p")).filter(
      (el) => /\bmd:hidden\b/.test(el.className) && /Indispensable/.test(el.textContent ?? ""),
    );
    expect(meta.length).toBeGreaterThan(0);
    const first = meta[0] as HTMLElement;
    expect(first.querySelector("[data-slot='lifecycle-status']")).not.toBeNull();
    expect(first.querySelector("[data-slot='priority-indicator']")).not.toBeNull();
    // Les cellules d'écran large (md:flex) portent la même information, plus les critères.
    const wide = Array.from(table.querySelectorAll<HTMLElement>("div")).filter(
      (el) => /\bmd:flex\b/.test(el.className) && /3 critères/.test(el.textContent ?? ""),
    );
    expect(wide.length).toBeGreaterThan(0);
  });

  it("« Charger la suite », filtres et « Effacer » à 44 px, pleine largeur", async () => {
    procedures.specListFeatures.mockResolvedValue(page(1, 3, "c1"));
    renderFeatures({ search: "?status=specifiee" });
    await findList();
    const control = screen.getByRole("button", { name: "Effacer les filtres" });
    expect(control.className).toMatch(/\bh-11\b/);
    expect(control.className).toMatch(/\bw-full\b|\bmax-md:w-full\b/);
    // Le pied de liste est celui de packages/ui : ses boutons passent à 44 px et pleine largeur sous 768 px.
    const footer = document.querySelector("[data-slot='list-footer']") as HTMLElement;
    expect(footer.className).toMatch(/max-md:\[&_button\]:h-11/);
    expect(footer.className).toMatch(/max-md:\[&_button\]:w-full/);
    expect(within(footer).getByRole("button", { name: "Charger la suite" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Statut" }).className).toMatch(
      /\bh-11\b|max-md:h-11/,
    );
  });

  it("aucun défilement horizontal imposé à la page (pas de largeur fixe ni d'overflow-x sur le conteneur)", async () => {
    renderFeatures();
    const table = await findList();
    expect(table.className).not.toMatch(/\bmin-w-\[?\d+/);
    expect(document.body.innerHTML).not.toMatch(/\bw-\[(?:[4-9]\d{2}|\d{4,})px\]/);
  });
});

describe("Mouvement réduit et chargement (§7)", () => {
  it("squelette pulsant seulement sous motion-safe:", async () => {
    procedures.specHead.mockImplementation(() => new Promise(() => undefined));
    renderFeatures();
    await findRole("status");
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
    await findList();
    expect(document.body.innerHTML).not.toMatch(/(^|[\s"])animate-(spin|pulse|bounce|ping)/);
  });
});

describe("Données volumineuses", () => {
  it("1 000 fonctionnalités : seules les lignes proches de l'écran sont dans le DOM, un lien par ligne, sans doublon", async () => {
    procedures.specListFeatures.mockResolvedValue(page(1, 50, "c1", { total: 1000 }));
    renderFeatures();
    const list = await findList();
    const links = within(list).getAllByRole("link");
    expect(links.length).toBeLessThan(40);
    expect(links).toHaveLength(within(list).getAllByRole("listitem").length);
    const ids = links.map((link) => link.getAttribute("data-feature-link"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(FEATURES).toHaveLength(3);
  });
});
